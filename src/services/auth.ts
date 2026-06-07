import { invoke } from "@tauri-apps/api/core";

// Champs réels retournés par GET /auth/me (email, status, created_at absents — écart API.md signalé)
export interface User {
  id: string;
  name: string;
  display_name: string;
  profile_picture: string;
}

export async function login(email: string, password: string): Promise<User> {
  return invoke<User>("login", { email, password });
}

export async function signup(name: string, email: string, password: string): Promise<User> {
  return invoke<User>("signup", { name, email, password });
}

export async function getCurrentUser(): Promise<User | null> {
  return invoke<User | null>("get_current_user");
}

export async function logout(): Promise<void> {
  return invoke<void>("logout");
}
