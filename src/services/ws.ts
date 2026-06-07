import { invoke } from "@tauri-apps/api/core";

export async function sendWsMessage(to: string, content: string): Promise<void> {
  return invoke<void>("send_ws_message", { to, content });
}
