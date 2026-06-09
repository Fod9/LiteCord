import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "./channels";

export async function sendWsMessage(
  to: string,
  content: string,
  attachments?: Attachment[],
): Promise<void> {
  return invoke<void>("send_ws_message", { to, content, attachments });
}
