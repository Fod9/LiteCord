import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("react-router", () => ({ useParams: vi.fn(), useLocation: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../context/GuildContext", () => ({ useGuild: vi.fn() }));
vi.mock("../../context/UnreadContext", () => ({ useUnread: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useParams, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useGuild } from "../../context/GuildContext";
import { useUnread } from "../../context/UnreadContext";
import GuildChannelPage from "../GuildChannelPage";

const GUILD_ID = "guild:1";
const CHANNEL_ID = "channel:abc";
const mockChannel = { id: CHANNEL_ID, guild: GUILD_ID, name: "général", channel_type: "Text", category: null, created_at: "2024-01-01T00:00:00Z" };
const mockUser = { id: "user:me", name: "Me", display_name: "Moi", profile_picture: "" };

const mockMessages = [
  { id: "message:001", channel: CHANNEL_ID, author: { id: "user:me", name: "Me", display_name: "Moi", profile_picture: "" }, content: "Salut !", reply_to: null, edited_at: null, created_at: "2024-01-01T10:00:00Z" },
  { id: "message:002", channel: CHANNEL_ID, author: { id: "user:other", name: "other", display_name: "Other", profile_picture: "" }, content: "Bonjour !", reply_to: null, edited_at: null, created_at: "2024-01-01T10:01:00Z" },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useParams).mockReturnValue({ guildId: GUILD_ID, channelId: CHANNEL_ID });
  vi.mocked(useLocation).mockReturnValue({ state: { channel: mockChannel }, pathname: `/guilds/${GUILD_ID}/channels/${CHANNEL_ID}`, search: "", hash: "", key: "default" });
  vi.mocked(useAuth).mockReturnValue({ user: mockUser, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
  vi.mocked(useGuild).mockReturnValue({ selectedGuild: { id: GUILD_ID, name: "Mon Serveur", icon: "", owner: "user:me", created_at: "2024-01-01T00:00:00Z" }, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
  vi.mocked(useUnread).mockReturnValue({ unread: {}, dmUnread: false, guildUnread: new Set(), markRead: vi.fn(), setActiveChannel: vi.fn(), registerChannel: vi.fn(), lockedChannels: new Set(), setChannelLocked: vi.fn() });
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "get_channel_messages") return mockMessages;
    if (cmd === "list_guild_members") return [];
    if (cmd === "list_guild_roles") return [];
    return undefined;
  });
});

describe("GuildChannelPage", () => {
  it("affiche le nom du channel en en-tête", async () => {
    render(<GuildChannelPage />);
    expect(screen.getAllByText("général").length).toBeGreaterThan(0);
  });

  it("charge et affiche l'historique des messages", async () => {
    render(<GuildChannelPage />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_channel_messages", { channelId: CHANNEL_ID }));
    expect(await screen.findByText("Salut !")).toBeInTheDocument();
    expect(screen.getByText("Bonjour !")).toBeInTheDocument();
  });

  it("affiche le display_name de l'utilisateur courant", async () => {
    render(<GuildChannelPage />);
    await screen.findByText("Salut !");
    expect(screen.getByText("Moi")).toBeInTheDocument();
  });

  it("affiche un message vide si aucun historique", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    render(<GuildChannelPage />);
    await waitFor(() => expect(screen.getByText("Aucun message pour le moment.")).toBeInTheDocument());
  });

  it("ajoute un message reçu via WS", async () => {
    const wsCallbacks: Record<string, (e: { payload: unknown }) => void> = {};
    vi.mocked(listen).mockImplementation(async (event, cb) => {
      wsCallbacks[event as string] = cb as (e: { payload: unknown }) => void;
      return () => {};
    });

    render(<GuildChannelPage />);
    await screen.findByText("Salut !");

    const newMsg = { id: "message:003", channel: CHANNEL_ID, author: { id: "user:other", name: "other", display_name: "Other", profile_picture: "" }, content: "Nouveau !", reply_to: null, edited_at: null, created_at: "2024-01-01T10:02:00Z" };
    act(() => wsCallbacks["new-message"]?.({ payload: newMsg }));

    expect(screen.getByText("Nouveau !")).toBeInTheDocument();
  });

  it("envoie un message et vide l'input", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_channel_messages") return mockMessages;
      return [];
    });
    render(<GuildChannelPage />);
    await screen.findByText("Salut !");

    const input = screen.getByPlaceholderText(/général/i);
    await act(() => userEvent.type(input, "Test{Enter}"));

    expect(invoke).toHaveBeenCalledWith("send_ws_message", { to: CHANNEL_ID, content: "Test" });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("n'envoie pas si le message est vide", async () => {
    render(<GuildChannelPage />);
    await screen.findByText("Salut !");

    const input = screen.getByPlaceholderText(/général/i);
    await act(() => userEvent.type(input, "{Enter}"));

    expect(invoke).not.toHaveBeenCalledWith("send_ws_message", expect.anything());
  });
});
