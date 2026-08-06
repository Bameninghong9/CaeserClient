use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct LocalSkin {
    pub id: String,
    pub name: String,
    pub file_name: String,
}

fn get_skins_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(appdata).join("CaeserClient").join("skins");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn get_skins_json_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let path = PathBuf::from(appdata).join("CaeserClient").join("skins.json");
    Ok(path)
}

#[tauri::command]
pub async fn get_local_skins() -> Result<Vec<LocalSkin>, String> {
    let path = get_skins_json_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let skins: Vec<LocalSkin> = serde_json::from_str(&content).unwrap_or_default();
    Ok(skins)
}

#[tauri::command]
pub async fn add_local_skin(name: String, base64_data: String) -> Result<LocalSkin, String> {
    let id = uuid::Uuid::new_v4().simple().to_string();
    let file_name = format!("{}.png", id);
    let dir = get_skins_dir()?;
    let file_path = dir.join(&file_name);
    
    // Remove "data:image/png;base64," prefix if it exists
    let b64 = if base64_data.contains(',') {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };
    
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    
    tokio::fs::write(&file_path, bytes).await.map_err(|e| e.to_string())?;
    
    let mut skins = get_local_skins().await?;
    let skin = LocalSkin {
        id: id.clone(),
        name,
        file_name,
    };
    
    skins.push(skin.clone());
    
    let path = get_skins_json_path()?;
    let json = serde_json::to_string_pretty(&skins).map_err(|e| e.to_string())?;
    tokio::fs::write(path, json).await.map_err(|e| e.to_string())?;
    
    Ok(skin)
}

#[tauri::command]
pub async fn remove_local_skin(id: String) -> Result<(), String> {
    let mut skins = get_local_skins().await?;
    if let Some(pos) = skins.iter().position(|s| s.id == id) {
        let skin = skins.remove(pos);
        let dir = get_skins_dir()?;
        let file_path = dir.join(&skin.file_name);
        
        let _ = tokio::fs::remove_file(file_path).await; // ignore if file doesn't exist
        
        let path = get_skins_json_path()?;
        let json = serde_json::to_string_pretty(&skins).map_err(|e| e.to_string())?;
        tokio::fs::write(path, json).await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_local_skin_base64(file_name: String) -> Result<String, String> {
    let dir = get_skins_dir()?;
    let file_path = dir.join(file_name);
    
    if !file_path.exists() {
        return Err("Skin file not found".to_string());
    }
    
    let bytes = tokio::fs::read(file_path).await.map_err(|e| e.to_string())?;
    use base64::{Engine as _, engine::general_purpose};
    let b64 = general_purpose::STANDARD.encode(bytes);
    
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub async fn get_user_skin_data(access_token: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if res.status().is_success() {
        let json = res.json().await.map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        Err(format!("Failed to get profile: {}", res.status()))
    }
}

#[tauri::command]
pub async fn apply_skin(access_token: String, file_name: String, variant: String) -> Result<(), String> {
    let dir = get_skins_dir()?;
    let file_path = dir.join(file_name);
    
    if !file_path.exists() {
        return Err("Skin file not found".to_string());
    }
    
    let bytes = tokio::fs::read(file_path).await.map_err(|e| e.to_string())?;
    
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("skin.png")
        .mime_str("image/png")
        .map_err(|e| e.to_string())?;
        
    let form = reqwest::multipart::Form::new()
        .text("variant", variant)
        .part("file", part);
        
    let client = reqwest::Client::new();
    let res = client.post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to apply skin: {}", res.status()))
    }
}
