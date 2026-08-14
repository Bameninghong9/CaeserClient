pub mod auth;
pub mod minecraft;

use auth::{login_begin_direct_oauth, login_finish_direct_oauth, start_oauth_callback_server, Credentials};
use tauri::{AppHandle, Emitter};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct InstanceCount(Arc<Mutex<u32>>);

#[tauri::command]
fn get_instance_count(state: tauri::State<InstanceCount>) -> u32 {
    *state.0.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
async fn login(app: AppHandle) -> Result<(), String> {
    // We use a fixed port for the callback server, e.g., 34567
    let port = 34567;
    let redirect_uri = format!("http://localhost:{}/callback", port);

    let flow = login_begin_direct_oauth(&redirect_uri).await?;

    let (server_handle, rx) = start_oauth_callback_server(port).await?;

    // Open the browser for the user to log in
    let _ = tauri_plugin_opener::open_url(&flow.authorize_url, None::<&str>);

    // Spawn a task to wait for the callback and finish login
    tauri::async_runtime::spawn(async move {
        match rx.await {
            Ok(Ok(code)) => {
                match login_finish_direct_oauth(&code, flow).await {
                    Ok(creds) => {
                        let _ = app.emit("login-success", creds);
                    }
                    Err(e) => {
                        let _ = app.emit("login-error", e);
                    }
                }
            }
            Ok(Err(e)) => {
                let _ = app.emit("login-error", e);
            }
            Err(_) => {
                let _ = app.emit("login-error", "Callback receiver dropped".to_string());
            }
        }
        // Stop the server task
        server_handle.abort();
    });

    Ok(())
}

#[tauri::command]
async fn get_versions() -> Result<Vec<String>, String> {
    minecraft::fetch_release_versions().await
}

pub mod profile_manager;
pub mod minecraft_launcher;
pub mod skin_manager;

#[tauri::command]
async fn launch_game(
    app: AppHandle, 
    version: String, 
    loader: String, 
    loader_version: String, 
    profile_name: String,
    ram: u32,
    java_args: String,
    creds: serde_json::Value,
    state: tauri::State<'_, InstanceCount>,
) -> Result<(), String> {
    let username = creds.get("username").and_then(|u| u.as_str()).unwrap_or("Player").to_string();
    let uuid = creds.get("id").and_then(|u| u.as_str()).unwrap_or("dummy_uuid").to_string();
    let access_token = creds.get("access_token").and_then(|u| u.as_str()).unwrap_or("dummy_token").to_string();
    
    let instance_id = uuid::Uuid::new_v4().simple().to_string();
    let counter = state.0.clone();

    // Open log window
    let window_label = "logs_window";
    if let Some(win) = app.get_webview_window(window_label) {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        if let Err(e) = tauri::WebviewWindowBuilder::new(
            &app,
            window_label,
            tauri::WebviewUrl::App("index.html?window=logs".into())
        )
        .title("Minecraft Logs")
        .inner_size(1050.0, 700.0)
        .decorations(false)
        .transparent(false)
        .center()
        .build() {
            println!("Failed to create log window: {}", e);
        }
    }

    let instance_id_clone = instance_id.clone();
    tauri::async_runtime::spawn(async move {
        // Delay to ensure the log window's React frontend has time to mount and register event listeners.
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

        if let Err(e) = minecraft_launcher::launch_minecraft(app.clone(), instance_id_clone, &version, &loader, &loader_version, &profile_name, ram, &username, &uuid, &access_token, &java_args, counter).await {
            let _ = app.emit("game-log", serde_json::json!({
                "instance_id": "ERROR",
                "line": format!("[ERROR] Failed to launch: {}", e)
            }));
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
async fn show_window(window: tauri::Window) {
    let _ = window.show();
}

#[tauri::command]
async fn maximize_window(window: tauri::Window) {
    if let Ok(true) = window.is_maximized() {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
async fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
async fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
async fn open_log_window(app: AppHandle) -> Result<(), String> {
    let window_label = "logs_window";
    if let Some(win) = app.get_webview_window(window_label) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    } else {
        if let Err(e) = tauri::WebviewWindowBuilder::new(
            &app,
            window_label,
            tauri::WebviewUrl::App("index.html?window=logs".into())
        )
        .title("Minecraft Logs")
        .inner_size(1050.0, 700.0)
        .decorations(false)
        .transparent(false)
        .center()
        .build() {
            return Err(format!("Failed to create log window: {}", e));
        }
    }
    Ok(())
}

#[tauri::command]
async fn exit_app(app: AppHandle) {
    app.exit(0);
}

use tauri::Manager;
use tokio::io::AsyncWriteExt;

#[derive(serde::Deserialize)]
struct ModrinthVersion {
    version_number: String,
    files: Vec<ModrinthFile>,
    dependencies: Option<Vec<ModrinthDependency>>,
}

#[derive(serde::Deserialize)]
struct ModrinthDependency {
    project_id: Option<String>,
    dependency_type: String,
}

#[derive(serde::Deserialize, Clone)]
struct ModrinthFile {
    url: String,
    filename: String,
    primary: bool,
}

#[derive(serde::Deserialize)]
struct CurseForgeFileResponse {
    data: Vec<CurseForgeFile>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFile {
    display_name: String,
    download_url: Option<String>,
    file_name: String,
    dependencies: Option<Vec<CurseForgeDependency>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeDependency {
    mod_id: u32,
    relation_type: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModData {
    pub id: String,
    pub name: String,
    pub author: String,
    pub summary: String,
    pub icon: String,
    pub platform: String,
    pub version: Option<String>,
    #[serde(rename = "itemType")]
    pub item_type: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct InstalledModsResponse {
    pub rich_mods: Vec<ModData>,
    pub local_files: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DependencyInfo {
    pub id: String,
    pub platform: String,
}

#[tauri::command]
async fn install_mod(
    app: AppHandle,
    mod_info: ModData,
    game_version: String,
    loader: String,
    profile_name: String,
) -> Result<Vec<DependencyInfo>, String> {
    let mut mod_info = mod_info;
    let loader_lower = loader.to_lowercase();
    let mod_id = &mod_info.id;
    let platform = &mod_info.platform;
    
    // Resolve Download URL and Filename
    let (download_url, filename, deps) = if platform == "modrinth" {
        let url = if mod_info.item_type.as_deref() == Some("mod") || mod_info.item_type.is_none() {
            format!(
                "https://api.modrinth.com/v2/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
                mod_id, loader_lower, game_version
            )
        } else {
            format!(
                "https://api.modrinth.com/v2/project/{}/version?game_versions=[\"{}\"]",
                mod_id, game_version
            )
        };
        
        let client = reqwest::Client::new();
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let versions: Vec<ModrinthVersion> = res.json().await.map_err(|e| e.to_string())?;
        
        let version = versions.into_iter().next().ok_or_else(|| "No compatible Modrinth version found".to_string())?;
        
        mod_info.version = Some(version.version_number.clone());
        
        let primary_file = version.files.iter().find(|f| f.primary).cloned();
        let file = primary_file.or_else(|| version.files.into_iter().next()).ok_or_else(|| "No file found in version".to_string())?;
        
        let mut deps = Vec::new();
        if let Some(dependencies) = version.dependencies {
            for dep in dependencies {
                if dep.dependency_type == "required" {
                    if let Some(pid) = dep.project_id {
                        deps.push(DependencyInfo {
                            id: pid,
                            platform: "modrinth".to_string(),
                        });
                    }
                }
            }
        }
        
        (file.url, file.filename, deps)
    } else if platform == "curseforge" {
        let loader_id = if mod_info.item_type.as_deref() == Some("mod") || mod_info.item_type.is_none() {
            match loader_lower.as_str() {
                "forge" => 1,
                "fabric" => 4,
                "quilt" => 5,
                "neoforge" => 6,
                _ => 0,
            }
        } else {
            0
        };
        
        let url = format!(
            "https://api.curse.tools/v1/cf/mods/{}/files?gameVersion={}&modLoaderType={}",
            mod_id, game_version, loader_id
        );
        let client = reqwest::Client::new();
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let response: CurseForgeFileResponse = res.json().await.map_err(|e| e.to_string())?;
        
        let file = response.data.into_iter().next().ok_or_else(|| "No compatible CurseForge version found".to_string())?;
        
        mod_info.version = Some(file.display_name.clone());
        
        let download_url = file.download_url.ok_or_else(|| "CurseForge file has no download URL".to_string())?;
        
        let mut deps = Vec::new();
        if let Some(dependencies) = file.dependencies {
            for dep in dependencies {
                if dep.relation_type == 3 {
                    deps.push(DependencyInfo {
                        id: dep.mod_id.to_string(),
                        platform: "curseforge".to_string(),
                    });
                }
            }
        }
        
        (download_url, file.file_name, deps)
    } else {
        return Err("Unknown platform".to_string());
    };

    // Ensure directory exists
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let app_dir = std::path::PathBuf::from(appdata).join("CaeserClient");
    let profile_dir = app_dir.join("profiles").join(&profile_name);
    
    let target_dir_name = match mod_info.item_type.as_deref() {
        Some("resourcepack") => "resourcepacks",
        Some("shader") => "shaderpacks",
        _ => "mods",
    };
    
    let target_dir = profile_dir.join(target_dir_name);
    tokio::fs::create_dir_all(&target_dir).await.map_err(|e| e.to_string())?;

    // Download the file
    let file_path = target_dir.join(&filename);
    let mut response = reqwest::get(&download_url).await.map_err(|e| e.to_string())?;
    
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    
    let mut file = tokio::fs::File::create(&file_path).await.map_err(|e| e.to_string())?;
    
    use sha1::{Sha1, Digest};
    let mut hasher = Sha1::new();
    use tauri::Emitter;

    #[derive(Clone, serde::Serialize)]
    struct DownloadProgressPayload {
        id: String,
        progress: f64,
    }

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        
        if total_size > 0 {
            downloaded += chunk.len() as u64;
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = app.emit("download-progress", DownloadProgressPayload {
                id: mod_info.id.clone(),
                progress,
            });
        }
    }
    
    let hash_bytes = hasher.finalize();
    let _hash_result: String = hash_bytes.iter().map(|b| format!("{:02x}", b)).collect();
    // We could verify the hash here if we had the expected hash from the API.
    
    // Save ModData to installed_mods.json
    let metadata_path = profile_dir.join("installed_mods.json");
    let mut installed_mods: Vec<ModData> = Vec::new();
    if metadata_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&metadata_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                installed_mods = parsed;
            }
        }
    }
    // Remove if already exists to avoid duplicates
    installed_mods.retain(|m| m.id != mod_info.id);
    installed_mods.push(mod_info);
    if let Ok(json) = serde_json::to_string_pretty(&installed_mods) {
        let _ = std::fs::write(&metadata_path, json);
    }

    println!("Successfully downloaded {} to {:?}", filename, file_path);

    Ok(deps)
}

#[tauri::command]
async fn get_installed_mods(profile_name: String) -> Result<InstalledModsResponse, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let app_dir = std::path::PathBuf::from(appdata).join("CaeserClient");
    let profile_dir = app_dir.join("profiles").join(&profile_name);
    let mods_dir = profile_dir.join("mods");
    let metadata_path = profile_dir.join("installed_mods.json");
    
    let mut rich_mods: Vec<ModData> = Vec::new();
    if metadata_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&metadata_path) {
            if let Ok(parsed) = serde_json::from_str(&content) {
                rich_mods = parsed;
            }
        }
    }

    let mut local_files = Vec::new();
    
    let dirs_to_scan = [("mods", "mod"), ("resourcepacks", "resourcepack"), ("shaderpacks", "shader")];
    
    for (dir_name, item_type) in dirs_to_scan {
        let scan_dir = profile_dir.join(dir_name);
        if scan_dir.exists() {
            if let Ok(mut entries) = tokio::fs::read_dir(scan_dir).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    if let Ok(file_type) = entry.file_type().await {
                        if file_type.is_file() {
                            let file_name = entry.file_name().to_string_lossy().to_string();
                            if file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled") || file_name.ends_with(".zip") || file_name.ends_with(".zip.disabled") {
                                // To let the frontend know the item type, we prefix local file names with "type:" internally, 
                                // or we can just send it as an object. But since it expects Vec<String>, we can format it.
                                // Wait, changing the return type to a struct is better. 
                                // Actually, let's keep it simple: just return the filename, 
                                // wait, if we have duplicate filenames in mods and resourcepacks?
                                // Let's format as `item_type::filename` for local_files.
                                local_files.push(format!("{}::{}", item_type, file_name));
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(InstalledModsResponse { rich_mods, local_files })
}

fn get_dir_size(path: &std::path::Path) -> std::io::Result<u64> {
    let mut size = 0;
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                size += get_dir_size(&path)?;
            } else {
                size += entry.metadata()?.len();
            }
        }
    }
    Ok(size)
}

#[tauri::command]
async fn get_profile_size(profile_name: String) -> Result<u64, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let profile_dir = std::path::PathBuf::from(appdata)
        .join("CaeserClient")
        .join("profiles")
        .join(&profile_name);
    
    match get_dir_size(&profile_dir) {
        Ok(size) => Ok(size),
        Err(_) => Ok(0)
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(InstanceCount::default())
        .invoke_handler(tauri::generate_handler![
            login, 
            get_versions, 
            launch_game,
            get_instance_count,
            minimize_window,
            show_window,
            maximize_window,
            close_window,
            hide_window,
            open_log_window,
            exit_app,
            install_mod,
            get_profile_size,
            profile_manager::profile_manager::get_profiles,
            profile_manager::profile_manager::save_profiles,
            profile_manager::profile_manager::get_settings,
            profile_manager::profile_manager::save_settings,
            auth::get_accounts,
            auth::save_accounts,
            get_installed_mods,
            toggle_mod_file,
            delete_mod_file,
            open_profile_folder,
            skin_manager::get_local_skins,
            skin_manager::add_local_skin,
            skin_manager::remove_local_skin,
            skin_manager::update_local_skin,
            skin_manager::get_local_skin_base64,
            skin_manager::get_user_skin_data,
            skin_manager::apply_skin,
            check_mod_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn open_profile_folder(profile_name: String) -> Result<(), String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let app_dir = std::path::PathBuf::from(appdata).join("CaeserClient");
    let profile_dir = app_dir.join("profiles").join(&profile_name);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(profile_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn toggle_mod_file(profile_name: String, file_name: String, disable: bool, item_type: Option<String>) -> Result<(), String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    
    let target_dir_name = match item_type.as_deref() {
        Some("resourcepack") => "resourcepacks",
        Some("shader") => "shaderpacks",
        _ => "mods",
    };
    
    let target_dir = std::path::PathBuf::from(appdata)
        .join("CaeserClient")
        .join("profiles")
        .join(&profile_name)
        .join(target_dir_name);

    let old_path = target_dir.join(&file_name);
    if !old_path.exists() {
        return Err("File not found".to_string());
    }

    let new_name = if disable {
        if file_name.ends_with(".disabled") { return Ok(()); }
        format!("{}.disabled", file_name)
    } else {
        if !file_name.ends_with(".disabled") { return Ok(()); }
        file_name.trim_end_matches(".disabled").to_string()
    };

    let new_path = target_dir.join(new_name);
    tokio::fs::rename(old_path, new_path).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_mod_file(profile_name: String, file_name: String, mod_id: Option<String>, item_type: Option<String>) -> Result<(), String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let profile_dir = std::path::PathBuf::from(appdata)
        .join("CaeserClient")
        .join("profiles")
        .join(&profile_name);
        
    let target_dir_name = match item_type.as_deref() {
        Some("resourcepack") => "resourcepacks",
        Some("shader") => "shaderpacks",
        _ => "mods",
    };
    let target_dir = profile_dir.join(target_dir_name);

    let file_path = target_dir.join(&file_name);
    if file_path.exists() {
        tokio::fs::remove_file(file_path).await.map_err(|e| e.to_string())?;
    }

    if let Some(id) = mod_id {
        let metadata_path = profile_dir.join("installed_mods.json");
        if metadata_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&metadata_path) {
                if let Ok(mut parsed) = serde_json::from_str::<Vec<ModData>>(&content) {
                    parsed.retain(|m| m.id != id);
                    if let Ok(json) = serde_json::to_string_pretty(&parsed) {
                        let _ = std::fs::write(&metadata_path, json);
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn check_mod_update(
    mod_info: ModData,
    game_version: String,
    loader: String,
) -> Result<Option<String>, String> {
    let loader_lower = loader.to_lowercase();
    let mod_id = &mod_info.id;
    let platform = &mod_info.platform;
    
    if platform == "modrinth" {
        let url = format!(
            "https://api.modrinth.com/v2/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
            mod_id, loader_lower, game_version
        );
        
        let client = reqwest::Client::new();
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let versions: Vec<ModrinthVersion> = res.json().await.map_err(|e| e.to_string())?;
        
        if let Some(latest_version) = versions.into_iter().next() {
            if let Some(installed_version) = &mod_info.version {
                if latest_version.version_number != *installed_version {
                    return Ok(Some(latest_version.version_number));
                }
            }
        }
        Ok(None)
    } else if platform == "curseforge" {
        let loader_id = match loader_lower.as_str() {
            "forge" => 1,
            "fabric" => 4,
            "quilt" => 5,
            "neoforge" => 6,
            _ => 0,
        };
        
        let url = format!(
            "https://api.curse.tools/v1/cf/mods/{}/files?gameVersion={}&modLoaderType={}",
            mod_id, game_version, loader_id
        );
        let client = reqwest::Client::new();
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let response: CurseForgeFileResponse = res.json().await.map_err(|e| e.to_string())?;
        
        if let Some(latest_file) = response.data.into_iter().next() {
            if let Some(installed_version) = &mod_info.version {
                if latest_file.display_name != *installed_version {
                    return Ok(Some(latest_file.display_name));
                }
            }
        }
        Ok(None)
    } else {
        Ok(None)
    }
}
