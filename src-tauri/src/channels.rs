use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct ChatUser {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub profile_picture: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct DmChannel {
    pub id: String,
    pub name: Option<String>,
    pub owner: String,
    pub participants: Vec<ChatUser>,
    pub last_message_id: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Friendship tel que retourné par GET /channels/list_dm (champs "in"/"out" = IDs bruts).
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct DmListFriendship {
    pub id: String,
    #[serde(rename(deserialize = "in"))]
    pub in_user: String,
    #[serde(rename(deserialize = "out"))]
    pub out_user: String,
    pub status: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DmState {
    pub channels: Vec<DmChannel>,
    pub friendships: Vec<DmListFriendship>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Attachment {
    pub url: String,
    pub filename: String,
    pub size: i64,
}

#[derive(Deserialize, Debug)]
pub struct PresignResponse {
    pub upload_url: String,
    pub cdn_url: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Message {
    pub id: String,
    pub channel: String,
    pub author: ChatUser,
    pub content: String,
    pub reply_to: Option<String>,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    pub edited_at: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_dm_channels(state: State<'_, AppState>) -> Result<DmState, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .get(format!("{}/channels/list_dm", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    let body = res.text().await.map_err(|e| e.to_string())?;

    let (channels, friendships): (Vec<DmChannel>, Vec<DmListFriendship>) =
        serde_json::from_str(&body)
            .map_err(|e| format!("désérialisation échouée: {} — body: {}", e, body))?;

    Ok(DmState { channels, friendships })
}

#[tauri::command]
pub async fn create_dm_channel(
    recipient_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<DmChannel, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .post(format!("{}/channels/dm", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "recipient_ids": recipient_ids }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<DmChannel>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_channel_messages(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let res = state
        .http
        .get(format!("{}/channels/{}/messages", state.api_url, channel_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<Message>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_attachment(
    filename: String,
    content_type: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<Attachment, String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let size = data.len() as i64;

    // Step 1 — presign
    let presign_res = state
        .http
        .post(format!("{}/cdn/presign", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "filename": filename,
            "content_type": content_type,
            "size": size
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !presign_res.status().is_success() {
        return Err(presign_res.text().await.unwrap_or_else(|_| "Erreur presign".into()));
    }

    let presign: PresignResponse = presign_res.json().await.map_err(|e| e.to_string())?;

    // Step 2 — PUT direct vers RustFS (URL déjà signée, pas de token ni Content-Type)
    let upload_res = state
        .http
        .put(&presign.upload_url)
        .body(data)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !upload_res.status().is_success() {
        return Err(format!("Upload échoué: {}", upload_res.status()));
    }

    Ok(Attachment { url: presign.cdn_url, filename, size })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialise_dm_list_friendship() {
        let json = r#"{
            "id": "friendship:abc",
            "in": "user:alice",
            "out": "user:bob",
            "status": "accepted",
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let f: DmListFriendship = serde_json::from_str(json).unwrap();
        assert_eq!(f.id, "friendship:abc");
        assert_eq!(f.in_user, "user:alice");
        assert_eq!(f.out_user, "user:bob");
        assert_eq!(f.status, "accepted");
    }

    #[test]
    fn deserialise_dm_state_complet() {
        let json = r#"[
            [{"id":"DMChannel:abc","name":null,"owner":"user:me","participants":[
                {"id":"user:me","name":"Me","display_name":"Me","profile_picture":""},
                {"id":"user:other","name":"FoD99","display_name":"FoD99","profile_picture":""}
            ],"last_message_id":null,"created_at":"2024-01-01T00:00:00Z"}],
            [{"id":"friendship:xyz","in":"user:other","out":"user:me","status":"accepted","created_at":"2024-01-01T00:00:00Z"}]
        ]"#;
        let (channels, friendships): (Vec<DmChannel>, Vec<DmListFriendship>) =
            serde_json::from_str(json).unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].participants.len(), 2);
        assert_eq!(friendships.len(), 1);
        assert_eq!(friendships[0].in_user, "user:other");
        assert_eq!(friendships[0].out_user, "user:me");
    }

    #[test]
    fn deserialise_dm_channel_avec_participants() {
        let json = r#"[
            [{"id":"DMChannel:abc","name":null,"owner":"user:me","participants":[
                {"id":"user:me","name":"Me","display_name":"Me","profile_picture":""},
                {"id":"user:other","name":"FoD99","display_name":"FoD99","profile_picture":""}
            ],"last_message_id":null,"created_at":"2024-01-01T00:00:00Z"}],
            []
        ]"#;
        let (channels, _): (Vec<DmChannel>, serde_json::Value) =
            serde_json::from_str(json).unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].participants.len(), 2);
        assert!(channels[0].participants.iter().any(|u| u.name == "FoD99"));
    }

    #[test]
    fn deserialise_dm_channel_cree() {
        let json = r#"{
            "id": "DMChannel:abc",
            "name": null,
            "owner": "user:me",
            "participants": [
                {"id":"user:me","name":"Me","display_name":"Me","profile_picture":""},
                {"id":"user:a","name":"Alice","display_name":"Alice","profile_picture":""},
                {"id":"user:b","name":"Bob","display_name":"Bob","profile_picture":""}
            ],
            "recipients_key": "user:a,user:b,user:me",
            "last_message_id": null,
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let ch: DmChannel = serde_json::from_str(json).unwrap();
        assert_eq!(ch.participants.len(), 3);
        assert!(ch.participants.iter().any(|u| u.name == "Alice"));
    }

    #[test]
    fn deserialise_message_complet() {
        let json = r#"{
            "id": "message:001",
            "channel": "DMChannel:abc",
            "author": {"id":"user:xyz","name":"xyz","display_name":"XYZ","profile_picture":""},
            "content": "Salut !",
            "reply_to": null,
            "edited_at": null,
            "created_at": "2024-01-01T10:00:00Z"
        }"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        assert_eq!(msg.author.id, "user:xyz");
        assert_eq!(msg.author.display_name, "XYZ");
        assert!(msg.reply_to.is_none());
    }

    #[test]
    fn deserialise_message_avec_reply() {
        let json = r#"{
            "id": "message:002",
            "channel": "DMChannel:abc",
            "author": {"id":"user:abc","name":"abc","display_name":"ABC","profile_picture":""},
            "content": "En réponse",
            "reply_to": "message:001",
            "edited_at": null,
            "created_at": "2024-01-01T10:01:00Z"
        }"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        assert_eq!(msg.author.id, "user:abc");
        assert_eq!(msg.reply_to, Some("message:001".to_string()));
    }
}
