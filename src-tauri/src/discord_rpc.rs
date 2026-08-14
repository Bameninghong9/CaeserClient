use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use tauri::State;

const CLIENT_ID: &str = "1537873712483663983";

pub struct DiscordState(pub Mutex<Option<DiscordIpcClient>>);

#[tauri::command]
pub fn set_discord_status(state: State<'_, DiscordState>, details: String, state_str: String, start_timestamp: Option<i64>) -> Result<(), String> {
    let mut client_lock = state.0.lock().map_err(|e| e.to_string())?;
    
    // If not connected, try to connect
    if client_lock.is_none() {
        let mut new_client = DiscordIpcClient::new(CLIENT_ID);
        if new_client.connect().is_ok() {
            *client_lock = Some(new_client);
        } else {
            return Err("Failed to connect to Discord IPC".to_string());
        }
    }

    if let Some(client) = client_lock.as_mut() {
        let mut payload = activity::Activity::new()
            .details(&details)
            .state(&state_str);
            
        let mut assets = activity::Assets::new()
            .large_image("caeser_logo") // Assuming the user uploads an image named caeser_logo
            .large_text("Caeser Client");
            
        payload = payload.assets(assets);

        if let Some(timestamp) = start_timestamp {
            let timestamps = activity::Timestamps::new().start(timestamp);
            payload = payload.timestamps(timestamps);
        }

        client.set_activity(payload).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn clear_discord_status(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut client_lock = state.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(client) = client_lock.as_mut() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    *client_lock = None;
    
    Ok(())
}
