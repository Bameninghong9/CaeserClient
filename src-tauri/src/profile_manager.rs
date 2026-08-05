pub mod profile_manager {
    use serde::{Deserialize, Serialize};
    use std::fs;
    use std::path::PathBuf;
    use tauri::AppHandle;
    use tauri::Manager;

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Profile {
        pub id: String,
        pub name: String,
        pub version: String,
        pub loader: String,
        pub ram: f64,
    }

    fn get_profiles_path() -> PathBuf {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        let dir = PathBuf::from(appdata).join(".caeserclient");
        let _ = std::fs::create_dir_all(&dir);
        dir.join("profiles.json")
    }

    #[tauri::command]
    pub async fn get_profiles(_app: AppHandle) -> Result<Vec<Profile>, String> {
        let path = get_profiles_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if data.trim().is_empty() {
            return Ok(Vec::new());
        }
        let profiles: Vec<Profile> = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(profiles)
    }

    #[tauri::command]
    pub async fn save_profiles(_app: AppHandle, profiles: Vec<Profile>) -> Result<(), String> {
        let path = get_profiles_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let data = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
        fs::write(&path, data).map_err(|e| e.to_string())?;
        Ok(())
    }
}
