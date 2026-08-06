use reqwest::Client;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{self, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};
use zip::ZipArchive;

pub async fn launch_minecraft(
    app: AppHandle,
    instance_id: String,
    version: &str,
    loader: &str,
    loader_version: &str,
    profile_name: &str,
    username: &str,
    uuid: &str,
    access_token: &str,
) -> Result<(), String> {
    let _ = app.emit("instance-started", serde_json::json!({
        "instance_id": instance_id,
        "profile_name": profile_name,
        "username": username,
        "start_time": chrono::Utc::now().to_rfc3339()
    }));
    let client = Client::new();
    let emit_log = |app: &AppHandle, id: &str, msg: String| {
        let _ = app.emit("game-log", serde_json::json!({
            "instance_id": id,
            "line": msg
        }));
    };
    let app_dir = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("CaeserClient");
    let mc_dir = app_dir.join("minecraft");
    let profile_dir = app_dir.join("profiles").join(profile_name);
    fs::create_dir_all(&mc_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    emit_log(&app, &instance_id, format!("[INFO] Resolving version {} (Loader: {})...", version, loader));

    // 1. Fetch version manifest
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_res: Value = client.get(manifest_url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    
    let version_entry = manifest_res["versions"].as_array().unwrap().iter().find(|v| v["id"].as_str() == Some(version))
        .ok_or_else(|| format!("Version {} not found in manifest", version))?;
    
    let version_url = version_entry["url"].as_str().unwrap();

    // 2. Fetch specific version json (Vanilla)
    emit_log(&app, &instance_id, "[INFO] Fetching Vanilla version data...".to_string());
    let version_data: Value = client.get(version_url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;

    // Fetch Fabric profile if loader is fabric
    let mut fabric_data: Option<Value> = None;
    if loader.to_lowercase() == "fabric" {
        let mut actual_loader_version = loader_version.to_string();
        
        // Dynamically fetch latest loader version if not provided or if it's the hardcoded old one
        if actual_loader_version.is_empty() || actual_loader_version == "0.16.2" {
            emit_log(&app, &instance_id, format!("[INFO] Resolving latest Fabric loader for {}...", version));
            let meta_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", version);
            if let Ok(res) = client.get(&meta_url).send().await {
                if let Ok(json) = res.json::<Value>().await {
                    if let Some(versions) = json.as_array() {
                        if let Some(latest) = versions.first() {
                            if let Some(lv) = latest.get("loader").and_then(|l| l.get("version")).and_then(|v| v.as_str()) {
                                actual_loader_version = lv.to_string();
                                emit_log(&app, &instance_id, format!("[INFO] Auto-resolved latest Fabric loader: {}", actual_loader_version));
                            }
                        }
                    }
                }
            }
        }

        emit_log(&app, &instance_id, format!("[INFO] Fetching Fabric profile {}...", actual_loader_version));
        let fabric_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", version, actual_loader_version);
        let res = client.get(&fabric_url).send().await;
        if let Ok(response) = res {
            if let Ok(json) = response.json().await {
                fabric_data = Some(json);
            }
        }
    }

    // 3. Download Client JAR
    let client_jar_path = mc_dir.join("versions").join(version).join(format!("{}.jar", version));
    if !client_jar_path.exists() {
        if let Some(parent) = client_jar_path.parent() {
            fs::create_dir_all(parent).unwrap_or(());
        }
        let client_dl_url = version_data["downloads"]["client"]["url"].as_str().unwrap();
        emit_log(&app, &instance_id, "[INFO] Downloading client JAR...".to_string());
        download_file(&client, client_dl_url, &client_jar_path).await?;
    }

    // 4. Download Libraries & Extract Natives
    let libs_dir = mc_dir.join("libraries");
    let natives_dir = mc_dir.join("versions").join(version).join("natives");
    fs::create_dir_all(&natives_dir).unwrap_or(());

    let mut classpath = Vec::new();

    emit_log(&app, &instance_id, "[INFO] Processing Vanilla libraries...".to_string());
    if let Some(libraries) = version_data["libraries"].as_array() {
        for lib in libraries {
            let rules = lib.get("rules").and_then(|r| r.as_array());
            if !evaluate_rules(rules) {
                continue;
            }

            // Standard artifact
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                if let Some(path) = artifact.get("path").and_then(|p| p.as_str()) {
                    let lib_path = libs_dir.join(path);
                    if !lib_path.exists() {
                        if let Some(url) = artifact.get("url").and_then(|u| u.as_str()) {
                            if let Some(parent) = lib_path.parent() { fs::create_dir_all(parent).unwrap_or(()); }
                            let _ = download_file(&client, url, &lib_path).await;
                        }
                    }
                    if lib_path.exists() {
                        classpath.push(lib_path.to_string_lossy().to_string());
                    }
                }
            }

            // Natives
            if let Some(natives) = lib.get("natives") {
                if let Some(classifier) = natives.get("windows").and_then(|c| c.as_str()) {
                    if let Some(classifier_data) = lib.get("downloads").and_then(|d| d.get("classifiers")).and_then(|c| c.get(classifier)) {
                        if let Some(path) = classifier_data.get("path").and_then(|p| p.as_str()) {
                            let lib_path = libs_dir.join(path);
                            if !lib_path.exists() {
                                if let Some(url) = classifier_data.get("url").and_then(|u| u.as_str()) {
                                    if let Some(parent) = lib_path.parent() { fs::create_dir_all(parent).unwrap_or(()); }
                                    let _ = download_file(&client, url, &lib_path).await;
                                }
                            }
                            if lib_path.exists() {
                                let _ = extract_natives(&lib_path, &natives_dir);
                            }
                        }
                    }
                }
            }
        }
    }

    // Process Fabric Libraries
    if let Some(ref fabric) = fabric_data {
        emit_log(&app, &instance_id, "[INFO] Processing Fabric libraries...".to_string());
        if let Some(libraries) = fabric["libraries"].as_array() {
            for lib in libraries {
                if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                    // Convert Maven coordinate to Path
                    let parts: Vec<&str> = name.split(':').collect();
                    if parts.len() >= 3 {
                        let domain = parts[0].replace(".", "/");
                        let artifact = parts[1];
                        let ver = parts[2];
                        let path = format!("{}/{}/{}/{}-{}.jar", domain, artifact, ver, artifact, ver);
                        
                        let url = if let Some(url) = lib.get("url").and_then(|u| u.as_str()) {
                            format!("{}{}", url, path)
                        } else {
                            format!("https://maven.fabricmc.net/{}", path)
                        };

                        let lib_path = libs_dir.join(&path);
                        if !lib_path.exists() {
                            if let Some(parent) = lib_path.parent() { fs::create_dir_all(parent).unwrap_or(()); }
                            let _ = download_file(&client, &url, &lib_path).await;
                        }
                        if lib_path.exists() {
                            classpath.push(lib_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    classpath.push(client_jar_path.to_string_lossy().to_string());
    let cp_string = classpath.join(";"); // Windows uses ;

    emit_log(&app, &instance_id, "[INFO] Downloading assets...".to_string());
    download_assets(&client, &app, &instance_id, &mc_dir, &version_data).await?;

    emit_log(&app, &instance_id, "[INFO] Launching JVM...".to_string());

    // 5. Build Command
    let main_class = if let Some(ref fabric) = fabric_data {
        fabric["mainClass"].as_str().unwrap_or("net.fabricmc.loader.impl.launch.knot.KnotClient")
    } else {
        version_data["mainClass"].as_str().unwrap()
    };
    
    let mut args = Vec::new();
    
    args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    args.push("-cp".to_string());
    args.push(cp_string);
    args.push(main_class.to_string());
    args.push("--username".to_string());
    args.push(username.to_string());
    args.push("--version".to_string());
    args.push(version.to_string());
    args.push("--gameDir".to_string());
    args.push(profile_dir.to_string_lossy().to_string());
    args.push("--assetsDir".to_string());
    args.push(mc_dir.join("assets").to_string_lossy().to_string());
    args.push("--assetIndex".to_string());
    args.push(version_data["assetIndex"]["id"].as_str().unwrap().to_string());
    args.push("--uuid".to_string());
    args.push(uuid.to_string());
    args.push("--accessToken".to_string());
    args.push(access_token.to_string());
    args.push("--userType".to_string());
    args.push("msa".to_string());

    let mut child = Command::new("java")
        .args(args)
        .current_dir(profile_dir.clone())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn java: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let logs_dir = profile_dir.join("logs");
    fs::create_dir_all(&logs_dir).unwrap_or(());
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let log_file_path = logs_dir.join(format!("launcher_{}.log.gz", timestamp));
    
    let file = File::create(&log_file_path).map_err(|e| e.to_string())?;
    let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let shared_encoder = std::sync::Arc::new(std::sync::Mutex::new(encoder));

    let app_clone1 = app.clone();
    let i_id1 = instance_id.clone();
    let enc1 = shared_encoder.clone();
    tauri::async_runtime::spawn(async move {
        use std::io::{BufRead, BufReader, Write};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone1.emit("game-log", serde_json::json!({ "instance_id": i_id1, "line": l }));
                if let Ok(mut enc) = enc1.lock() {
                    let _ = writeln!(enc, "{}", l);
                }
            }
        }
    });

    let app_clone2 = app.clone();
    let i_id2 = instance_id.clone();
    let enc2 = shared_encoder.clone();
    tauri::async_runtime::spawn(async move {
        use std::io::{BufRead, BufReader, Write};
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone2.emit("game-log", serde_json::json!({ "instance_id": i_id2, "line": format!("[ERROR] {}", l) }));
                if let Ok(mut enc) = enc2.lock() {
                    let _ = writeln!(enc, "[ERROR] {}", l);
                }
            }
        }
    });

    let enc3 = shared_encoder.clone();
    tauri::async_runtime::spawn(async move {
        let _ = child.wait();
        let _ = app.emit("instance-stopped", serde_json::json!({ "instance_id": instance_id }));
        if let Ok(mut enc) = enc3.lock() {
            let _ = enc.try_finish();
        }
    });

    Ok(())
}

fn evaluate_rules(rules: Option<&Vec<Value>>) -> bool {
    if let Some(r) = rules {
        let mut allowed = false;
        for rule in r {
            let action = rule["action"].as_str().unwrap_or("");
            let os_name = rule.get("os").and_then(|o| o.get("name")).and_then(|n| n.as_str());
            if action == "allow" {
                if os_name.is_none() || os_name == Some("windows") {
                    allowed = true;
                }
            } else if action == "disallow" {
                if os_name == Some("windows") {
                    allowed = false;
                }
            }
        }
        allowed
    } else {
        true
    }
}

async fn download_file(client: &Client, url: &str, path: &Path) -> Result<(), String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_natives(zip_path: &Path, extract_to: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    if let Ok(mut archive) = ZipArchive::new(reader) {
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).unwrap();
            let outpath = match file.enclosed_name() {
                Some(path) => path.to_owned(),
                None => continue,
            };
            if file.name().ends_with(".dll") {
                let out_file_path = extract_to.join(outpath.file_name().unwrap());
                if let Ok(mut outfile) = File::create(&out_file_path) {
                    let _ = io::copy(&mut file, &mut outfile);
                }
            }
        }
    }
    Ok(())
}

async fn download_assets(client: &Client, app: &AppHandle, instance_id: &str, mc_dir: &Path, version_data: &Value) -> Result<(), String> {
    let _ = app.emit("game-log", serde_json::json!({ "instance_id": instance_id, "line": "[INFO] Processing assets (this might take a while on first launch)..." }));
    
    let asset_index_obj = version_data.get("assetIndex").ok_or("No assetIndex found")?;
    let index_id = asset_index_obj["id"].as_str().unwrap();
    let index_url = asset_index_obj["url"].as_str().unwrap();

    let indexes_dir = mc_dir.join("assets").join("indexes");
    fs::create_dir_all(&indexes_dir).map_err(|e| e.to_string())?;
    
    let index_path = indexes_dir.join(format!("{}.json", index_id));
    if !index_path.exists() {
        download_file(client, index_url, &index_path).await?;
    }

    let index_content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index_json: Value = serde_json::from_str(&index_content).map_err(|e| e.to_string())?;

    let objects = index_json.get("objects").and_then(|o| o.as_object()).ok_or("No objects in asset index")?;
    
    let objects_dir = mc_dir.join("assets").join("objects");
    
    let mut missing_assets = Vec::new();

    for (_key, value) in objects {
        if let Some(hash) = value.get("hash").and_then(|h| h.as_str()) {
            let prefix = &hash[0..2];
            let asset_dir = objects_dir.join(prefix);
            let asset_path = asset_dir.join(hash);
            
            if !asset_path.exists() {
                missing_assets.push((hash.to_string(), asset_dir, asset_path));
            }
        }
    }

    if missing_assets.is_empty() {
        let _ = app.emit("game-log", serde_json::json!({ "instance_id": instance_id, "line": "[INFO] All assets are already downloaded." }));
        return Ok(());
    }

    let total = missing_assets.len();
    let _ = app.emit("game-log", serde_json::json!({ "instance_id": instance_id, "line": format!("[INFO] Downloading {} missing assets...", total) }));

    use futures::future::join_all;
    let chunks: Vec<_> = missing_assets.chunks(50).collect();
    
    let mut count = 0;
    for chunk in chunks {
        let mut futures = Vec::new();
        for (hash, dir, path) in chunk {
            let h = hash.clone();
            let d = dir.clone();
            let p = path.clone();
            let c = client.clone();
            
            futures.push(tokio::spawn(async move {
                fs::create_dir_all(&d).unwrap_or(());
                let url = format!("https://resources.download.minecraft.net/{}/{}", &h[0..2], h);
                let _ = download_file(&c, &url, &p).await;
            }));
        }
        join_all(futures).await;
        count += chunk.len();
        let _ = app.emit("game-log", serde_json::json!({ "instance_id": instance_id, "line": format!("[INFO] Downloaded {}/{} assets", count, total) }));
    }

    Ok(())
}
