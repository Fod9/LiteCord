use tauri::State;

use crate::AppState;

#[tauri::command]
pub async fn join_voice_channel(
    guild_id: String,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "message_type": "voice_join",
        "channel_id": channel_id,
        "guild_id": guild_id,
    })
    .to_string();

    *state.current_voice_channel.lock().unwrap() = Some(channel_id);

    state
        .ws_sender
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("WebSocket non connecté")?
        .send(payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn leave_voice_channel(state: State<'_, AppState>) -> Result<(), String> {
    *state.current_voice_channel.lock().unwrap() = None;

    let payload = serde_json::json!({ "message_type": "voice_leave" }).to_string();

    state
        .ws_sender
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("WebSocket non connecté")?
        .send(payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_voice_channel(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.current_voice_channel.lock().unwrap().clone())
}
