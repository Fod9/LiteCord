use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{store::Tokens, AppState};

#[derive(Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub profile_picture: String,
}

#[derive(Deserialize)]
struct TokensResponse {
    token: String,
    refresh_token: String,
}

async fn fetch_tokens(
    http: &reqwest::Client,
    url: &str,
    body: serde_json::Value,
) -> Result<TokensResponse, String> {
    let res = http
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Request failed".into()));
    }
    res.json().await.map_err(|e| e.to_string())
}

async fn fetch_me(http: &reqwest::Client, api_url: &str, token: &str) -> Result<User, String> {
    let res = http
        .get(format!("{}/auth/me", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_else(|_| "Unauthorized".into()));
    }

    let body = res.text().await.map_err(|e| e.to_string())?;

    serde_json::from_str::<User>(&body)
        .map_err(|e| format!("désérialisation User échouée: {} — body: {}", e, body))
}

#[tauri::command]
pub async fn login(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<User, String> {
    let tokens = fetch_tokens(
        &state.http,
        &format!("{}/auth/login", state.api_url),
        serde_json::json!({ "email": email, "password": password }),
    )
    .await?;

    let stored = Tokens {
        token: tokens.token.clone(),
        refresh_token: tokens.refresh_token,
    };
    state
        .token_store
        .lock()
        .unwrap()
        .save(&stored)
        .map_err(|e| e.to_string())?;

    fetch_me(&state.http, &state.api_url, &tokens.token).await
}

#[tauri::command]
pub async fn signup(
    name: String,
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<User, String> {
    let tokens = fetch_tokens(
        &state.http,
        &format!("{}/auth/signup", state.api_url),
        serde_json::json!({ "name": name, "email": email, "password": password }),
    )
    .await?;

    let stored = Tokens {
        token: tokens.token.clone(),
        refresh_token: tokens.refresh_token,
    };
    state
        .token_store
        .lock()
        .unwrap()
        .save(&stored)
        .map_err(|e| e.to_string())?;

    fetch_me(&state.http, &state.api_url, &tokens.token).await
}

#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<Option<User>, String> {
    let tokens = state.token_store.lock().unwrap().load();
    let Some(tokens) = tokens else {
        return Ok(None);
    };

    match fetch_me(&state.http, &state.api_url, &tokens.token).await {
        Ok(user) => Ok(Some(user)),
        Err(_) => {
            state.token_store.lock().unwrap().clear();
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    state.token_store.lock().unwrap().clear();
    Ok(())
}
