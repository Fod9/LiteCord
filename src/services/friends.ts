import { invoke } from "@tauri-apps/api/core";

export interface FriendUser {
  id: string;
  name: string;
  display_name: string;
  profile_picture: string;
}

export interface Friendship {
  id: string;
  in_user: FriendUser;
  out_user: FriendUser;
  status: string;
  created_at: string;
}

export async function addFriend(name: string): Promise<string> {
  return invoke<string>("add_friend", { name });
}

export async function listFriends(): Promise<Friendship[]> {
  return invoke<Friendship[]>("list_friends");
}

export async function listPendingRequests(): Promise<Friendship[]> {
  return invoke<Friendship[]>("list_pending_requests");
}

export async function updateFriendRequest(
  friendshipId: string,
  action: "accept" | "reject"
): Promise<string> {
  return invoke<string>("update_friend_request", { friendshipId, action });
}

export async function deleteFriend(friendshipId: string): Promise<string> {
  return invoke<string>("delete_friend", { friendshipId });
}
