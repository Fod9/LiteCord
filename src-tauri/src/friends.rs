use serde::{de, Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::AppState;

// Désérialise {"tb": "friendship", "id": {"String": "xxxx"}} → "friendship:xxxx"
#[derive(Deserialize)]
struct SurrealIdValue {
    #[serde(rename = "String")]
    string: Option<String>,
}

#[derive(Deserialize)]
struct SurrealIdRaw {
    tb: String,
    id: SurrealIdValue,
}

fn deserialize_surreal_id<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let raw = SurrealIdRaw::deserialize(d)?;
    let s = raw.id.string.ok_or_else(|| de::Error::custom("id type non supporté"))?;
    Ok(format!("{}:{}", raw.tb, s))
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct FriendUser {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub profile_picture: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Friendship {
    #[serde(deserialize_with = "deserialize_surreal_id")]
    pub id: String,
    pub in_user: FriendUser,
    pub out_user: FriendUser,
    pub status: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn add_friend(name: String, state: State<'_, AppState>) -> Result<String, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .post(format!("{}/friends/add_friend/{}", state.api_url, name))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_friend(
    friendship_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .delete(format!("{}/friends/{}", state.api_url, friendship_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_friends(state: State<'_, AppState>) -> Result<Vec<Friendship>, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .post(format!("{}/friends/list_friends", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    let body = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<Friendship>>(&body)
        .map_err(|e| format!("désérialisation échouée: {} — body: {}", e, body))
}

#[tauri::command]
pub async fn list_pending_requests(state: State<'_, AppState>) -> Result<Vec<Friendship>, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .get(format!("{}/friends/pending", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    let body = res.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<Friendship>>(&body)
        .map_err(|e| format!("désérialisation échouée: {} — body: {}", e, body))
}

#[tauri::command]
pub async fn update_friend_request(
    friendship_id: String,
    action: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .post(format!(
            "{}/friends/update_friend_request/{}/{}",
            state.api_url, friendship_id, action
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.text().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "id": {"tb": "friendship", "id": {"String": "5kjela256dys3wm3rejv"}},
        "in_user": {"id": "user:aaa", "name": "FoD99", "display_name": "FoD99", "profile_picture": ""},
        "out_user": {"id": "user:bbb", "name": "FoD9", "display_name": "FoD9", "profile_picture": ""},
        "status": "pending",
        "created_at": "2026-06-07T03:45:23.194176Z"
    }"#;

    #[test]
    fn deserialise_id_surreal() {
        let f: Friendship = serde_json::from_str(SAMPLE).unwrap();
        assert_eq!(f.id, "friendship:5kjela256dys3wm3rejv");
    }

    #[test]
    fn deserialise_in_out_user() {
        let f: Friendship = serde_json::from_str(SAMPLE).unwrap();
        assert_eq!(f.in_user.name, "FoD99");
        assert_eq!(f.out_user.id, "user:bbb");
    }

    #[test]
    fn deserialise_liste_vide() {
        let v: Vec<Friendship> = serde_json::from_str("[]").unwrap();
        assert!(v.is_empty());
    }
}
