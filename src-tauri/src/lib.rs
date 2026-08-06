pub mod auth;
pub mod minecraft;

use auth::{login_begin_direct_oauth, login_finish_direct_oauth, start_oauth_callback_server, Credentials};
use tauri::{AppHandle, Emitter};

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

#[tauri::command]
async fn launch_game(
    app: AppHandle, 
    version: String, 
    loader: String, 
    loader_version: String, 
    profile_name: String,
    creds: serde_json::Value
) -> Result<(), String> {
    let username = creds.get("username").and_then(|u| u.as_str()).unwrap_or("Player").to_string();
    let uuid = creds.get("id").and_then(|u| u.as_str()).unwrap_or("dummy_uuid").to_string();
    let access_token = creds.get("access_token").and_then(|u| u.as_str()).unwrap_or("dummy_token").to_string();
    
    // Log window removed per user request

    // Open log window
    let window_label = format!("logs_{}", uuid::Uuid::new_v4().simple());
    if let Err(e) = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App("index.html?window=logs".into())
    )
    .title("Minecraft Logs")
    .inner_size(900.0, 600.0)
    .decorations(false)
    .transparent(true)
    .center()
    .build() {
        println!("Failed to create log window: {}", e);
    }

    tauri::async_runtime::spawn(async move {
        if let Err(e) = minecraft_launcher::launch_minecraft(app.clone(), &version, &loader, &loader_version, &profile_name, &username, &uuid, &access_token).await {
            let _ = app.emit("game-log", format!("[ERROR] Failed to launch: {}", e));
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
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

use tauri::Manager;
use tokio::io::AsyncWriteExt;

#[derive(serde::Deserialize)]
struct ModrinthVersion {
    version_number: String,
    files: Vec<ModrinthFile>,
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
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct InstalledModsResponse {
    pub rich_mods: Vec<ModData>,
    pub local_files: Vec<String>,
}

#[tauri::command]
async fn install_mod(
    app: AppHandle,
    mod_info: ModData,
    game_version: String,
    loader: String,
    profile_name: String,
) -> Result<(), String> {
    let mut mod_info = mod_info;
    let loader_lower = loader.to_lowercase();
    let mod_id = &mod_info.id;
    let platform = &mod_info.platform;
    
    // Resolve Download URL and Filename
    let (download_url, filename) = if platform == "modrinth" {
        let url = format!(
            "https://api.modrinth.com/v2/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
            mod_id, loader_lower, game_version
        );
        let client = reqwest::Client::new();
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        let versions: Vec<ModrinthVersion> = res.json().await.map_err(|e| e.to_string())?;
        
        let version = versions.into_iter().next().ok_or_else(|| "No compatible Modrinth version found".to_string())?;
        
        mod_info.version = Some(version.version_number.clone());
        
        let primary_file = version.files.iter().find(|f| f.primary).cloned();
        let file = primary_file.or_else(|| version.files.into_iter().next()).ok_or_else(|| "No file found in version".to_string())?;
        
        (file.url, file.filename)
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
        
        let file = response.data.into_iter().next().ok_or_else(|| "No compatible CurseForge version found".to_string())?;
        
        mod_info.version = Some(file.display_name.clone());
        
        let download_url = file.download_url.ok_or_else(|| "CurseForge file has no download URL".to_string())?;
        
        (download_url, file.file_name)
    } else {
        return Err("Unknown platform".to_string());
    };

    // Ensure directory exists
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let app_dir = std::path::PathBuf::from(appdata).join("CaeserClient");
    let profile_dir = app_dir.join("profiles").join(&profile_name);
    let mods_dir = profile_dir.join("mods");
    tokio::fs::create_dir_all(&mods_dir).await.map_err(|e| e.to_string())?;

    // Download the file
    let file_path = mods_dir.join(&filename);
    let mut response = reqwest::get(&download_url).await.map_err(|e| e.to_string())?;
    let mut file = tokio::fs::File::create(&file_path).await.map_err(|e| e.to_string())?;
    
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    
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

    Ok(())
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
    if mods_dir.exists() {
        if let Ok(mut entries) = tokio::fs::read_dir(mods_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(file_type) = entry.file_type().await {
                    if file_type.is_file() {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        if file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled") {
                            local_files.push(file_name);
                        }
                    }
                }
            }
        }
    }
    
    Ok(InstalledModsResponse { rich_mods, local_files })
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            login, 
            get_versions, 
            launch_game,
            minimize_window,
            maximize_window,
            close_window,
            install_mod,
            profile_manager::profile_manager::get_profiles,
            profile_manager::profile_manager::save_profiles,
            auth::get_accounts,
            auth::save_accounts,
            get_installed_mods,
            toggle_mod_file,
            delete_mod_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn toggle_mod_file(profile_name: String, file_name: String, disable: bool) -> Result<(), String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let mods_dir = std::path::PathBuf::from(appdata)
        .join("CaeserClient")
        .join("profiles")
        .join(&profile_name)
        .join("mods");

    let old_path = mods_dir.join(&file_name);
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

    let new_path = mods_dir.join(new_name);
    tokio::fs::rename(old_path, new_path).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_mod_file(profile_name: String, file_name: String, mod_id: Option<String>) -> Result<(), String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let profile_dir = std::path::PathBuf::from(appdata)
        .join("CaeserClient")
        .join("profiles")
        .join(&profile_name);
    let mods_dir = profile_dir.join("mods");

    let file_path = mods_dir.join(&file_name);
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
