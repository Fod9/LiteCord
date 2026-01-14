import { getCurrentWindow } from "@tauri-apps/api/window"

export async function updateTitle(newTitle: string) {
  const appWindow = getCurrentWindow();
  await appWindow.setTitle(newTitle);
}



