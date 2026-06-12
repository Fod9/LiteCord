import { describe, it, expect, vi, beforeEach } from "vitest";
import { listDmChannels, getChannelMessages, createDmChannel } from "../channels";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockChannels = [
  {
    id: "DMChannel:abc",
    name: null,
    owner: "user:xyz",
    participants: [
      { id: "user:xyz", name: "Alice", display_name: "Alice", profile_picture: "" },
      { id: "user:abc", name: "Bob", display_name: "Bob", profile_picture: "" },
    ],
    last_message_id: null,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "DMChannel:def",
    name: null,
    owner: "user:xyz",
    participants: [],
    last_message_id: "message:001",
    created_at: "2024-01-02T00:00:00Z",
  },
];

beforeEach(() => vi.clearAllMocks());

const mockMessages = [
  {
    id: "message:001",
    channel: "DMChannel:abc",
    author: "user:xyz",
    content: "Salut !",
    reply_to: null,
    edited_at: null,
    created_at: "2024-01-01T10:00:00Z",
  },
  {
    id: "message:002",
    channel: "DMChannel:abc",
    author: "user:abc",
    content: "Hello !",
    reply_to: null,
    edited_at: null,
    created_at: "2024-01-01T10:01:00Z",
  },
];

describe("getChannelMessages", () => {
  it("invokes 'get_channel_messages' avec le channelId et retourne les messages", async () => {
    vi.mocked(invoke).mockResolvedValue(mockMessages);
    const result = await getChannelMessages("DMChannel:abc");
    expect(invoke).toHaveBeenCalledWith("get_channel_messages", { channelId: "DMChannel:abc", limit: 50, before: null });
    expect(result).toEqual(mockMessages);
  });

  it("retourne un tableau vide si aucun message", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    expect(await getChannelMessages("DMChannel:abc")).toEqual([]);
  });

  it("propage l'erreur Rust en cas d'échec", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Non authentifié"));
    await expect(getChannelMessages("DMChannel:abc")).rejects.toThrow("Non authentifié");
  });
});

describe("listDmChannels", () => {
  it("invokes 'list_dm_channels' et retourne les channels", async () => {
    vi.mocked(invoke).mockResolvedValue(mockChannels);
    const result = await listDmChannels();
    expect(invoke).toHaveBeenCalledWith("list_dm_channels");
    expect(result).toEqual(mockChannels);
  });

  it("retourne un tableau vide quand il n'y a pas de DM", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const result = await listDmChannels();
    expect(result).toEqual([]);
  });

  it("propage l'erreur Rust en cas d'échec", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Non authentifié"));
    await expect(listDmChannels()).rejects.toThrow("Non authentifié");
  });
});

describe("createDmChannel", () => {
  const newChannel = {
    id: "DMChannel:new",
    name: null,
    owner: "user:me",
    participants: [
      { id: "user:me", name: "Me", display_name: "Me", profile_picture: "" },
      { id: "user:alice", name: "Alice", display_name: "Alice", profile_picture: "" },
    ],
    last_message_id: null,
    created_at: "2024-01-01T00:00:00Z",
  };

  it("invokes 'create_dm_channel' avec les recipient_ids et retourne le channel", async () => {
    vi.mocked(invoke).mockResolvedValue(newChannel);
    const result = await createDmChannel(["user:alice"]);
    expect(invoke).toHaveBeenCalledWith("create_dm_channel", { recipientIds: ["user:alice"] });
    expect(result).toEqual(newChannel);
  });

  it("supporte plusieurs destinataires (groupe)", async () => {
    vi.mocked(invoke).mockResolvedValue(newChannel);
    await createDmChannel(["user:alice", "user:bob"]);
    expect(invoke).toHaveBeenCalledWith("create_dm_channel", {
      recipientIds: ["user:alice", "user:bob"],
    });
  });

  it("propage l'erreur si un destinataire est introuvable", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("404"));
    await expect(createDmChannel(["user:unknown"])).rejects.toThrow("404");
  });
});
