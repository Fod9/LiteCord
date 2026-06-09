import { invoke } from "@tauri-apps/api/core";

export interface Guild {
  id: string;
  name: string;
  icon: string;
  owner: string;
  created_at: string;
}

export interface GuildChannel {
  id: string;
  guild: string;
  name: string;
  channel_type: "Text" | "Voice";
  category: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  guild: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
}

export interface GuildInvite {
  id: string;
  guild: string;
  inviter: string;
  code: string;
  expires_at: string | null;
  created_at: string;
}

export interface GuildMember {
  id: string;
  user: { id: string; name: string; display_name: string; profile_picture: string };
  roles: string[];
  nickname: string | null;
  joined_at: string;
}

export async function listGuilds(): Promise<Guild[]> {
  return invoke<Guild[]>("list_guilds");
}

export async function createGuild(name: string, icon: string): Promise<Guild> {
  return invoke<Guild>("create_guild", { name, icon });
}

export async function joinGuild(code: string): Promise<Guild> {
  return invoke<Guild>("join_guild", { code });
}

export async function leaveGuild(guildId: string): Promise<void> {
  return invoke<void>("leave_guild", { guildId });
}

export async function getGuildChannels(guildId: string): Promise<GuildChannel[]> {
  return invoke<GuildChannel[]>("get_guild_channels", { guildId });
}

export async function createGuildChannel(
  guildId: string,
  name: string,
  channelType: "Text" | "Voice",
  category: string | null
): Promise<GuildChannel> {
  return invoke<GuildChannel>("create_guild_channel", { guildId, name, channelType, category });
}

export async function deleteGuildChannel(guildId: string, channelId: string): Promise<void> {
  return invoke<void>("delete_guild_channel", { guildId, channelId });
}

export async function deleteGuild(guildId: string): Promise<void> {
  return invoke<void>("delete_guild", { guildId });
}

export async function createGuildInvite(guildId: string): Promise<GuildInvite> {
  return invoke<GuildInvite>("create_guild_invite", { guildId });
}

export async function listGuildRoles(guildId: string): Promise<Role[]> {
  return invoke<Role[]>("list_guild_roles", { guildId });
}

export async function createGuildRole(guildId: string, name: string, color: string): Promise<Role> {
  return invoke<Role>("create_guild_role", { guildId, name, color });
}

export async function deleteGuildRole(guildId: string, roleId: string): Promise<void> {
  return invoke<void>("delete_guild_role", { guildId, roleId });
}

export async function updateGuild(guildId: string, name: string | null, icon: string | null): Promise<Guild> {
  return invoke<Guild>("update_guild", { guildId, name, icon });
}

export async function listGuildMembers(guildId: string): Promise<GuildMember[]> {
  return invoke<GuildMember[]>("list_guild_members", { guildId });
}

export async function kickGuildMember(guildId: string, userId: string): Promise<void> {
  return invoke<void>("kick_guild_member", { guildId, userId });
}

export async function listGuildInvites(guildId: string): Promise<GuildInvite[]> {
  return invoke<GuildInvite[]>("list_guild_invites", { guildId });
}

export async function revokeGuildInvite(guildId: string, inviteId: string): Promise<void> {
  return invoke<void>("revoke_guild_invite", { guildId, inviteId });
}

export async function assignGuildRole(guildId: string, userId: string, roleId: string): Promise<void> {
  return invoke<void>("assign_guild_role", { guildId, userId, roleId });
}

export async function removeGuildRole(guildId: string, userId: string, roleId: string): Promise<void> {
  return invoke<void>("remove_guild_role", { guildId, userId, roleId });
}
