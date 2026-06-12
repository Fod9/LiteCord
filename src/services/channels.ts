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

/** Friendship tel que retourné par list_dm_channels (in_user/out_user = IDs bruts). */
export interface DmListFriendship {
  id: string;
  in_user: string;
  out_user: string;
  status: string;
  created_at?: string;
}

export interface DmState {
  channels: DmChannel[];
  friendships: DmListFriendship[];
}

export interface Attachment {
  url: string;
  filename: string;
  size: number;
}

export interface Message {
  id: string;
  channel: string;
  author: ChatUser;
  content: string;
  reply_to: string | null;
  attachments: Attachment[];
  edited_at: string | null;
  created_at: string;
}

export async function uploadAttachment(
  filename: string,
  contentType: string,
  path: string,
): Promise<Attachment> {
  return invoke<Attachment>("upload_attachment", { filename, contentType, path });
}

export async function listDmChannels(): Promise<DmState> {
  return invoke<DmState>("list_dm_channels");
}

export async function lockChannel(channelId: string): Promise<void> {
  return invoke<void>("lock_channel", { channelId });
}

export async function unlockChannel(channelId: string): Promise<void> {
  return invoke<void>("unlock_channel", { channelId });
}

export async function createDmChannel(recipientIds: string[]): Promise<DmChannel> {
  return invoke<DmChannel>("create_dm_channel", { recipientIds });
}

export async function getChannelMessages(
  channelId: string,
  options?: { limit?: number; before?: string },
): Promise<Message[]> {
  return invoke<Message[]>("get_channel_messages", {
    channelId,
    limit: options?.limit ?? 50,
    before: options?.before ?? null,
  });
}
