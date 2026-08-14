pub mod profile_manager {
    use serde::{Deserialize, Serialize};
    use std::fs;
    use std::path::PathBuf;
    use tauri::AppHandle;

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Profile {
        pub id: String,
        pub name: String,
        pub version: String,
        pub loader: String,
        pub loader_version: Option<String>,
        pub ram: f64,
    }

    #[derive(Serialize, Deserialize, Clone, Debug)]
    pub struct Settings {
        pub last_played_profile: Option<String>,
        pub ram: Option<f64>,
        pub java_args: Option<String>,
        pub theme: Option<String>,
    }

    impl Default for Settings {
        fn default() -> Self {
            Self {
                last_played_profile: None,
                ram: Some(4096.0),
                java_args: Some("-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions".to_string()),
                theme: Some("dark".to_string()),
            }
        }
    }

    fn get_app_dir() -> Result<std::path::PathBuf, String> {
        let appdata = std::env::var("APPDATA").map_err(|_| "No APPDATA".to_string())?;
        let path = std::path::PathBuf::from(appdata).join("CaeserClient");
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        }
        Ok(path)
    }

    fn safe_write(path: &PathBuf, data: &str) -> Result<(), String> {
        let temp_path = path.with_extension("tmp");
        fs::write(&temp_path, data).map_err(|e| e.to_string())?;
        fs::rename(&temp_path, path).map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_profiles(_app: AppHandle) -> Result<Vec<Profile>, String> {
        let path = get_app_dir()?.join("profiles.json");
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
        let path = get_app_dir()?.join("profiles.json");
        let data = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
        safe_write(&path, &data)
    }

    #[tauri::command]
    pub async fn get_settings(_app: AppHandle) -> Result<Settings, String> {
        let path = get_app_dir()?.join("settings.json");
        if !path.exists() {
            return Ok(Settings::default());
        }
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if data.trim().is_empty() {
            return Ok(Settings::default());
        }
        let settings: Settings = serde_json::from_str(&data).unwrap_or_default();
        Ok(settings)
    }

    #[tauri::command]
    pub async fn save_settings(_app: AppHandle, settings: Settings) -> Result<(), String> {
        let path = get_app_dir()?.join("settings.json");
        let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        safe_write(&path, &data)
    }
}
