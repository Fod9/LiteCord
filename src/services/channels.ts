import { invoke } from "@tauri-apps/api/core";

export interface ChatUser {
  id: string;
  name: string;
  display_name: string;
  profile_picture: string;
}

export interface DmChannel {
  id: string;
  name: string | null;
  owner: string;
  participants: ChatUser[];
  last_message_id: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  channel: string;
  author: string;
  content: string;
  reply_to: string | null;
  edited_at: string | null;
  created_at: string;
}

export async function listDmChannels(): Promise<DmChannel[]> {
  return invoke<DmChannel[]>("list_dm_channels");
}

export async function createDmChannel(recipientIds: string[]): Promise<DmChannel> {
  return invoke<DmChannel>("create_dm_channel", { recipientIds });
}

export async function getChannelMessages(channelId: string): Promise<Message[]> {
  return invoke<Message[]>("get_channel_messages", { channelId });
}
