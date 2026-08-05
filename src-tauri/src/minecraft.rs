use reqwest::Client;
use serde::{Deserialize, Serialize};

use once_cell::sync::Lazy;

static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| Client::new());

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

pub async fn fetch_release_versions() -> Result<Vec<String>, String> {
    let res = HTTP_CLIENT
        .get("https://launchermeta.mojang.com/mc/game/version_manifest.json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let manifest: VersionManifest = res.json().await.map_err(|e| e.to_string())?;

    let mut releases: Vec<String> = manifest
        .versions
        .into_iter()
        .filter(|v| v.version_type == "release")
        .map(|v| v.id)
        .collect();

    // Reverse them to have oldest first or keep them newest first. 
    // Mojang manifest is newest first by default. Let's keep newest first, but the user asked for 1.0 to newest.
    // If they want 1.0 to newest, we reverse the list.
    releases.reverse();

    Ok(releases)
}
