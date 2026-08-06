use axum::{extract::Query, response::Html, routing::get, Router};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use uuid::Uuid;
use base64::prelude::{BASE64_URL_SAFE_NO_PAD, Engine};
use std::path::PathBuf;
use std::fs;

use once_cell::sync::Lazy;

const DIRECT_OAUTH_CLIENT_ID: &str = "e16699bb-2aa8-46da-b5e3-45cbcce29091";
const DIRECT_OAUTH_AUTHORIZE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const DIRECT_OAUTH_TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap()
});

fn get_accounts_path() -> Result<std::path::PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "No APPDATA".to_string())?;
    let path = std::path::PathBuf::from(appdata).join("CaeserClient").join("accounts.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
pub fn get_accounts() -> Result<Vec<Credentials>, String> {
    let path = get_accounts_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let accounts: Vec<Credentials> = serde_json::from_str(&content).unwrap_or_else(|_| Vec::new());
    Ok(accounts)
}

#[tauri::command]
pub fn save_accounts(accounts: Vec<Credentials>) -> Result<(), String> {
    let path = get_accounts_path()?;
    let content = serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Credentials {
    pub id: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DirectOAuthFlow {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
    pub redirect_uri: String,
    pub authorize_url: String,
}

#[derive(Deserialize)]
struct OAuthToken {
    expires_in: u64,
    access_token: String,
    refresh_token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DeviceToken {
    token: String,
    display_claims: HashMap<String, serde_json::Value>,
}

fn generate_oauth_challenge() -> String {
    let u1 = Uuid::new_v4().to_string().replace("-", "");
    let u2 = Uuid::new_v4().to_string().replace("-", "");
    format!("{}{}", u1, u2)
}

pub async fn login_begin_direct_oauth(redirect_uri: &str) -> Result<DirectOAuthFlow, String> {
    let verifier = generate_oauth_challenge();
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(&verifier);
    let result = hasher.finalize();
    let challenge = BASE64_URL_SAFE_NO_PAD.encode(result);

    let state = generate_oauth_challenge();

    let mut authorize_url = url::Url::parse(DIRECT_OAUTH_AUTHORIZE_URL).map_err(|e| e.to_string())?;

    authorize_url
        .query_pairs_mut()
        .append_pair("client_id", DIRECT_OAUTH_CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", "XboxLive.signin offline_access")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("prompt", "select_account");

    Ok(DirectOAuthFlow {
        verifier,
        challenge,
        state,
        redirect_uri: redirect_uri.to_string(),
        authorize_url: authorize_url.to_string(),
    })
}

pub async fn start_oauth_callback_server(
    port: u16,
) -> Result<(tokio::task::JoinHandle<()>, oneshot::Receiver<Result<String, String>>), String> {
    let (tx, rx) = oneshot::channel();
    let tx_shared = Arc::new(tokio::sync::Mutex::new(Some(tx)));

    let app = Router::new().route(
        "/callback",
        get({
            let tx_shared = tx_shared.clone();
            move |Query(params): Query<HashMap<String, String>>| {
                let tx_shared = tx_shared.clone();
                async move {
                    if let Some(code) = params.get("code") {
                        if let Some(tx) = tx_shared.lock().await.take() {
                            let _ = tx.send(Ok(code.clone()));
                        }
                        Html("<html><body><h1>Login successful! You can close this window now.</h1><script>window.close();</script></body></html>".to_string())
                    } else {
                        if let Some(tx) = tx_shared.lock().await.take() {
                            let _ = tx.send(Err("Failed to login".to_string()));
                        }
                        Html("<html><body><h1>Login failed.</h1></body></html>".to_string())
                    }
                }
            }
        }),
    );

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    Ok((handle, rx))
}

pub async fn login_finish_direct_oauth(
    code: &str,
    flow: DirectOAuthFlow,
) -> Result<Credentials, String> {
    let oauth_token = direct_oauth_token(code, &flow.verifier, &flow.redirect_uri).await?;
    let xbox_token = xbox_authenticate_rps(&oauth_token.access_token).await?;
    let xsts_token = xsts_authorize_direct(xbox_token).await?;
    let minecraft_token = minecraft_token(xsts_token).await?;
    let profile = minecraft_profile(&minecraft_token.access_token).await?;

    let creds = Credentials {
        id: profile.id,
        username: profile.name,
        access_token: minecraft_token.access_token,
        refresh_token: oauth_token.refresh_token,
        expires: Utc::now() + Duration::seconds(oauth_token.expires_in as i64),
    };

    Ok(creds)
}

async fn direct_oauth_token(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthToken, String> {
    let mut query = HashMap::new();
    query.insert("client_id", DIRECT_OAUTH_CLIENT_ID);
    query.insert("code", code);
    query.insert("code_verifier", verifier);
    query.insert("grant_type", "authorization_code");
    query.insert("redirect_uri", redirect_uri);

    let res = HTTP_CLIENT
        .post(DIRECT_OAUTH_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn xbox_authenticate_rps(access_token: &str) -> Result<String, String> {
    let res = HTTP_CLIENT
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    json.get("Token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing Token field in Xbox auth response".to_string())
}

async fn xsts_authorize_direct(xbox_token: String) -> Result<DeviceToken, String> {
    let res = HTTP_CLIENT
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbox_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct MinecraftToken {
    access_token: String,
}

async fn minecraft_token(token: DeviceToken) -> Result<MinecraftToken, String> {
    let uhs = token
        .display_claims
        .get("xui")
        .and_then(|x| x.get(0))
        .and_then(|x| x.get("uhs"))
        .and_then(|x| x.as_str().map(String::from))
        .ok_or_else(|| "No User Hash".to_string())?;

    let token = token.token;

    let res = HTTP_CLIENT
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Accept", "application/json")
        .json(&json!({
            "identityToken": format!("XBL3.0 x={uhs};{token}")
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn minecraft_profile(token: &str) -> Result<MinecraftProfile, String> {
    let res = HTTP_CLIENT
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Accept", "application/json")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}
