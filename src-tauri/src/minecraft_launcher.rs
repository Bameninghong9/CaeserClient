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
    version: &str,
    loader: &str,
    loader_version: &str,
    profile_name: &str,
    username: &str,
    uuid: &str,
    access_token: &str,
) -> Result<(), String> {
    let client = Client::new();
    let app_dir = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".caeserclient");
    let mc_dir = app_dir.join("minecraft");
    let profile_dir = app_dir.join("profiles").join(profile_name);
    fs::create_dir_all(&mc_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    app.emit("game-log", format!("[INFO] Resolving version {} (Loader: {})...", version, loader)).unwrap_or(());

    // 1. Fetch version manifest
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_res: Value = client.get(manifest_url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    
    let version_entry = manifest_res["versions"].as_array().unwrap().iter().find(|v| v["id"].as_str() == Some(version))
        .ok_or_else(|| format!("Version {} not found in manifest", version))?;
    
    let version_url = version_entry["url"].as_str().unwrap();

    // 2. Fetch specific version json (Vanilla)
    app.emit("game-log", "[INFO] Fetching Vanilla version data...".to_string()).unwrap_or(());
    let version_data: Value = client.get(version_url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;

    // Fetch Fabric profile if loader is fabric
    let mut fabric_data: Option<Value> = None;
    if loader.to_lowercase() == "fabric" {
        let mut actual_loader_version = loader_version.to_string();
        
        // Dynamically fetch latest loader version if not provided or if it's the hardcoded old one
        if actual_loader_version.is_empty() || actual_loader_version == "0.16.2" {
            app.emit("game-log", format!("[INFO] Resolving latest Fabric loader for {}...", version)).unwrap_or(());
            let meta_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", version);
            if let Ok(res) = client.get(&meta_url).send().await {
                if let Ok(json) = res.json::<Value>().await {
                    if let Some(versions) = json.as_array() {
                        if let Some(latest) = versions.first() {
                            if let Some(lv) = latest.get("loader").and_then(|l| l.get("version")).and_then(|v| v.as_str()) {
                                actual_loader_version = lv.to_string();
                                app.emit("game-log", format!("[INFO] Auto-resolved latest Fabric loader: {}", actual_loader_version)).unwrap_or(());
                            }
                        }
                    }
                }
            }
        }

        app.emit("game-log", format!("[INFO] Fetching Fabric profile {}...", actual_loader_version)).unwrap_or(());
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
        app.emit("game-log", "[INFO] Downloading client JAR...".to_string()).unwrap_or(());
        download_file(&client, client_dl_url, &client_jar_path).await?;
    }

    // 4. Download Libraries & Extract Natives
    let libs_dir = mc_dir.join("libraries");
    let natives_dir = mc_dir.join("versions").join(version).join("natives");
    fs::create_dir_all(&natives_dir).unwrap_or(());

    let mut classpath = Vec::new();

    app.emit("game-log", "[INFO] Processing Vanilla libraries...".to_string()).unwrap_or(());
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
        app.emit("game-log", "[INFO] Processing Fabric libraries...".to_string()).unwrap_or(());
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

    app.emit("game-log", "[INFO] Launching JVM...".to_string()).unwrap_or(());

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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn java: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_clone1 = app.clone();
    tauri::async_runtime::spawn(async move {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone1.emit("game-log", l);
            }
        }
    });

    let app_clone2 = app.clone();
    tauri::async_runtime::spawn(async move {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone2.emit("game-log", format!("[ERROR] {}", l));
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        let _ = child.wait();
        let _ = app.emit("game-exit", ());
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
