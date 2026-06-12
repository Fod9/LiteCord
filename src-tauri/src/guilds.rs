use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::channels::ChatUser;
use crate::AppState;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Guild {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub owner: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct PermissionOverwrite {
    pub target: String,
    pub allow: Vec<String>,
    pub deny: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct GuildChannel {
    pub id: String,
    pub guild: String,
    pub name: String,
    pub channel_type: String,
    pub category: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub permission_overwrites: Vec<PermissionOverwrite>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Role {
    pub id: String,
    pub guild: String,
    pub name: String,
    pub color: String,
    pub position: i32,
    pub permissions: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct GuildInvite {
    pub id: String,
    pub guild: String,
    pub inviter: String,
    pub code: String,
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct GuildMember {
    pub id: String,
    pub user: ChatUser,
    pub roles: Vec<String>,
    pub nickname: Option<String>,
    pub joined_at: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct MemberWithPermissions {
    pub member: GuildMember,
    pub permissions: Vec<String>,
}

fn get_token(state: &State<'_, AppState>) -> Result<String, String> {
    state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié".into())
        .map(|t| t.token)
}

#[tauri::command]
pub async fn list_guilds(state: State<'_, AppState>) -> Result<Vec<Guild>, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<Guild>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_guild(
    name: String,
    icon: String,
    state: State<'_, AppState>,
) -> Result<Guild, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/", state.api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "name": name, "icon": icon }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Guild>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn join_guild(code: String, state: State<'_, AppState>) -> Result<Guild, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/join/{}", state.api_url, code))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Guild>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn leave_guild(guild_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/{}/leave", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_guild_channels(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GuildChannel>, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/{}/channels", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<GuildChannel>>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_guild_channel(
    guild_id: String,
    name: String,
    channel_type: String,
    category: Option<String>,
    state: State<'_, AppState>,
) -> Result<GuildChannel, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/{}/channels", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "name": name, "channel_type": channel_type, "category": category }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<GuildChannel>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_guild_channel(
    guild_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .delete(format!("{}/guilds/{}/channels/{}", state.api_url, guild_id, channel_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_guild(guild_id: String, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .delete(format!("{}/guilds/{}", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    let _ = app.emit("guild-deleted", &guild_id);
    Ok(())
}

#[tauri::command]
pub async fn create_guild_invite(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<GuildInvite, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/{}/invites", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<GuildInvite>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_guild_roles(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Role>, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/{}/roles", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<Role>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_guild_role(
    guild_id: String,
    name: String,
    color: String,
    permissions: Vec<String>,
    position: i32,
    state: State<'_, AppState>,
) -> Result<Role, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/{}/roles", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "name": name, "color": color, "position": position, "permissions": permissions }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Role>().await.map_err(|e| e.to_string())
}

// Les champs `None` sont omis du corps et donc conservés par le serveur.
#[tauri::command]
pub async fn update_guild_role(
    guild_id: String,
    role_id: String,
    name: Option<String>,
    color: Option<String>,
    position: Option<i32>,
    permissions: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<Role, String> {
    let token = get_token(&state)?;

    let mut body = serde_json::Map::new();
    if let Some(v) = name { body.insert("name".into(), v.into()); }
    if let Some(v) = color { body.insert("color".into(), v.into()); }
    if let Some(v) = position { body.insert("position".into(), v.into()); }
    if let Some(v) = permissions { body.insert("permissions".into(), v.into()); }

    let res = state
        .http
        .patch(format!("{}/guilds/{}/roles/{}", state.api_url, guild_id, role_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Role>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_guild(
    guild_id: String,
    name: Option<String>,
    icon: Option<String>,
    state: State<'_, AppState>,
) -> Result<Guild, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .patch(format!("{}/guilds/{}", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "name": name, "icon": icon }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Guild>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_guild_members(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GuildMember>, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/{}/members", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<GuildMember>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_my_guild_member(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<MemberWithPermissions, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/{}/members/me", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<MemberWithPermissions>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kick_guild_member(
    guild_id: String,
    user_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!("{}/guilds/{}/members/{}/kick", state.api_url, guild_id, user_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn list_guild_invites(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GuildInvite>, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .get(format!("{}/guilds/{}/invites", state.api_url, guild_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<Vec<GuildInvite>>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revoke_guild_invite(
    guild_id: String,
    invite_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .delete(format!("{}/guilds/{}/invites/{}", state.api_url, guild_id, invite_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_guild_role(
    guild_id: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .delete(format!("{}/guilds/{}/roles/{}", state.api_url, guild_id, role_id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn assign_guild_role(
    guild_id: String,
    user_id: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .post(format!(
            "{}/guilds/{}/members/{}/roles/{}",
            state.api_url, guild_id, user_id, role_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_guild_role(
    guild_id: String,
    user_id: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .delete(format!(
            "{}/guilds/{}/members/{}/roles/{}",
            state.api_url, guild_id, user_id, role_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    Ok(())
}

#[tauri::command]
pub async fn set_channel_permissions(
    guild_id: String,
    channel_id: String,
    permission_overwrites: Vec<PermissionOverwrite>,
    state: State<'_, AppState>,
) -> Result<GuildChannel, String> {
    let token = get_token(&state)?;

    let res = state
        .http
        .put(format!(
            "{}/guilds/{}/channels/{}/permissions",
            state.api_url, guild_id, channel_id
        ))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "permission_overwrites": permission_overwrites }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Erreur serveur".into()));
    }

    res.json::<GuildChannel>().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialise_guild_member() {
        let json = r#"{
            "id": "member_of:abc",
            "user": {"id":"user:1","name":"alice","display_name":"Alice","profile_picture":""},
            "roles": ["role:1", "role:2"],
            "nickname": null,
            "joined_at": "2024-01-01T00:00:00Z"
        }"#;
        let m: GuildMember = serde_json::from_str(json).unwrap();
        assert_eq!(m.user.name, "alice");
        assert_eq!(m.roles.len(), 2);
        assert!(m.nickname.is_none());
    }

    #[test]
    fn deserialise_guild_member_avec_nickname() {
        let json = r#"{
            "id": "member_of:xyz",
            "user": {"id":"user:2","name":"bob","display_name":"Bob","profile_picture":""},
            "roles": [],
            "nickname": "Bobby",
            "joined_at": "2024-01-02T00:00:00Z"
        }"#;
        let m: GuildMember = serde_json::from_str(json).unwrap();
        assert_eq!(m.nickname, Some("Bobby".to_string()));
        assert!(m.roles.is_empty());
    }

    #[test]
    fn deserialise_member_with_permissions() {
        let json = r#"{
            "member": {
                "id": "member_of:abc",
                "user": {"id":"user:1","name":"alice","display_name":"Alice","profile_picture":""},
                "roles": ["role:1"],
                "nickname": null,
                "joined_at": "2024-01-01T00:00:00Z"
            },
            "permissions": ["view_channels", "send_messages", "kick_members"]
        }"#;
        let m: MemberWithPermissions = serde_json::from_str(json).unwrap();
        assert_eq!(m.member.user.name, "alice");
        assert_eq!(m.permissions.len(), 3);
        assert!(m.permissions.contains(&"kick_members".to_string()));
    }

    #[test]
    fn deserialise_role() {
        let json = r##"{
            "id": "role:abc",
            "guild": "guild:1",
            "name": "Modérateur",
            "color": "#ff5733",
            "position": 1,
            "permissions": ["manage_messages", "kick_members"]
        }"##;
        let role: Role = serde_json::from_str(json).unwrap();
        assert_eq!(role.name, "Modérateur");
        assert_eq!(role.permissions.len(), 2);
    }

    #[test]
    fn deserialise_guild_invite_sans_expiration() {
        let json = r#"{
            "id": "guild_invite:abc",
            "guild": "guild:1",
            "inviter": "user:me",
            "code": "ABCD1234",
            "expires_at": null,
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let invite: GuildInvite = serde_json::from_str(json).unwrap();
        assert_eq!(invite.code, "ABCD1234");
        assert!(invite.expires_at.is_none());
    }

    #[test]
    fn deserialise_guild_invite_avec_expiration() {
        let json = r#"{
            "id": "guild_invite:xyz",
            "guild": "guild:1",
            "inviter": "user:me",
            "code": "ZZZZ9999",
            "expires_at": "2024-12-31T23:59:59Z",
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let invite: GuildInvite = serde_json::from_str(json).unwrap();
        assert!(invite.expires_at.is_some());
    }

    #[test]
    fn deserialise_guild() {
        let json = r#"{
            "id": "guild:abc",
            "name": "Mon Serveur",
            "icon": "",
            "owner": "user:me",
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let g: Guild = serde_json::from_str(json).unwrap();
        assert_eq!(g.id, "guild:abc");
        assert_eq!(g.name, "Mon Serveur");
    }

    #[test]
    fn deserialise_liste_guilds() {
        let json = r#"[
            {"id":"guild:1","name":"Serveur A","icon":"","owner":"user:me","created_at":"2024-01-01T00:00:00Z"},
            {"id":"guild:2","name":"Serveur B","icon":"🎮","owner":"user:other","created_at":"2024-01-02T00:00:00Z"}
        ]"#;
        let guilds: Vec<Guild> = serde_json::from_str(json).unwrap();
        assert_eq!(guilds.len(), 2);
        assert_eq!(guilds[1].icon, "🎮");
    }

    #[test]
    fn deserialise_guild_channel_text() {
        let json = r#"{
            "id": "channel:xyz",
            "guild": "guild:abc",
            "name": "général",
            "channel_type": "Text",
            "category": null,
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let ch: GuildChannel = serde_json::from_str(json).unwrap();
        assert_eq!(ch.channel_type, "Text");
        assert!(ch.category.is_none());
    }

    #[test]
    fn deserialise_guild_channel_avec_categorie() {
        let json = r#"{
            "id": "channel:xyz",
            "guild": "guild:abc",
            "name": "vocal-général",
            "channel_type": "Voice",
            "category": "Vocal",
            "created_at": "2024-01-01T00:00:00Z"
        }"#;
        let ch: GuildChannel = serde_json::from_str(json).unwrap();
        assert_eq!(ch.channel_type, "Voice");
        assert_eq!(ch.category, Some("Vocal".to_string()));
    }
}
