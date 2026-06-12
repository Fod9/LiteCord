import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../../../context/GuildContext", () => ({ useGuild: vi.fn() }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../../context/UnreadContext", () => ({ useUnread: vi.fn() }));
vi.mock("../../../context/VoiceContext", () => ({ useVoice: vi.fn() }));
vi.mock("react-router", () => ({ useNavigate: vi.fn(), useParams: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGuild } from "../../../context/GuildContext";
import { useAuth } from "../../../context/AuthContext";
import { useUnread } from "../../../context/UnreadContext";
import { useNavigate, useParams } from "react-router";
import { useVoice } from "../../../context/VoiceContext";
import ChannelsSideBar from "../ChannelsSideBar";
import type { Guild } from "../../../services/guilds";

const mockGuild: Guild = {
  id: "guild:1",
  name: "Mon Serveur",
  icon: "",
  owner: "user:me",
  created_at: "2024-01-01T00:00:00Z",
};

const mockChannels = [
  { id: "channel:1", guild: "guild:1", name: "général", channel_type: "Text", category: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "channel:2", guild: "guild:1", name: "annonces", channel_type: "Text", category: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "channel:3", guild: "guild:1", name: "vocal-général", channel_type: "Voice", category: "Vocal", created_at: "2024-01-01T00:00:00Z" },
];

const SOCLE = ["view_channels", "send_messages", "attach_files", "create_invite", "connect", "speak"];

const mockNavigate = vi.fn();
const mockOwner = { id: "user:me", name: "me", display_name: "Me", profile_picture: "" };
const mockMember = { id: "user:other", name: "other", display_name: "Other", profile_picture: "" };

/** Mock d'invoke par commande ; myPermissions = retour serveur de get_my_guild_member. */
function mockInvokeByCommand(myPermissions: string[] = SOCLE, overrides: Record<string, unknown> = {}) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd in overrides) return overrides[cmd];
    if (cmd === "get_guild_channels") return mockChannels;
    if (cmd === "get_my_guild_member") {
      return {
        member: { id: "member_of:x", user: mockMember, roles: [], nickname: null, joined_at: "2024-01-01T00:00:00Z" },
        permissions: myPermissions,
      };
    }
    return undefined;
  });
}

function mockAuthAs(user: typeof mockOwner) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, wsStatus: "connected" as const, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
}

const mockVoice: ReturnType<typeof useVoice> = {
  currentChannelId: null,
  currentGuildId: null,
  voiceStates: {},
  isMuted: false,
  isSharing: false,
  screenQuality: 1080,
  screenFps: 30,
  setScreenQuality: vi.fn(),
  setScreenFps: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  toggleMute: vi.fn(),
  toggleScreen: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useParams).mockReturnValue({});
  vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
  vi.mocked(useUnread).mockReturnValue({ unread: {}, dmUnread: false, guildUnread: new Set(), markRead: vi.fn(), setActiveChannel: vi.fn(), registerChannel: vi.fn(), lockedChannels: new Set(), setChannelLocked: vi.fn(), pendingFriendRequests: 0, setPendingFriendRequests: vi.fn(), registerFriendPendingRefresh: vi.fn(), registerFriendListRefresh: vi.fn() } as ReturnType<typeof useUnread>);
  vi.mocked(useVoice).mockReturnValue(mockVoice);
  mockInvokeByCommand();
});

describe("ChannelsSideBar", () => {
  it("charge et affiche les channels du guild sélectionné", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_guild_channels", { guildId: "guild:1" }));
    expect(await screen.findByText("général")).toBeInTheDocument();
    expect(screen.getByText("annonces")).toBeInTheDocument();
  });

  it("affiche le nom du guild en en-tête", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);
    expect(await screen.findByText("Mon Serveur")).toBeInTheDocument();
  });

  it("affiche les channels Voice sous leur catégorie", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);

    expect(await screen.findByText("Vocal")).toBeInTheDocument();
    expect(screen.getByText("vocal-général")).toBeInTheDocument();
  });

  it("clic sur un channel Text navigue vers la bonne route", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);
    await userEvent.click(await screen.findByText("général"));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/guilds/guild:1/channels/channel:1",
      expect.objectContaining({ state: expect.objectContaining({ channel: mockChannels[0] }) })
    );
  });

  it("owner voit le bouton créer un channel", async () => {
    mockAuthAs(mockOwner);
    mockInvokeByCommand([...SOCLE, "manage_channels"]);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(await screen.findByLabelText("Créer un channel")).toBeInTheDocument();
  });

  it("membre sans permission manage_channels ne voit pas le bouton créer un channel", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);
    await screen.findByText("général");
    // attend la résolution des permissions avant d'affirmer l'absence
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_my_guild_member", { guildId: "guild:1" }));

    expect(screen.queryByLabelText("Créer un channel")).not.toBeInTheDocument();
  });

  it("membre avec la permission manage_channels voit les boutons créer et supprimer", async () => {
    mockAuthAs(mockMember);
    mockInvokeByCommand([...SOCLE, "manage_channels"]);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(await screen.findByLabelText("Créer un channel")).toBeInTheDocument();
    expect(screen.getByLabelText("Supprimer général")).toBeInTheDocument();
  });

  it("owner peut créer un channel Text", async () => {
    const newChannel = { id: "channel:99", guild: "guild:1", name: "nouveau", channel_type: "Text", category: null, created_at: "2024-01-01T00:00:00Z" };
    mockAuthAs(mockOwner);
    mockInvokeByCommand([...SOCLE, "manage_channels"], { create_guild_channel: newChannel });

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    await userEvent.click(await screen.findByLabelText("Créer un channel"));
    await userEvent.type(screen.getByPlaceholderText(/nom du channel/i), "nouveau");
    await userEvent.click(screen.getByRole("button", { name: /créer le channel/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_guild_channel", {
        guildId: "guild:1", name: "nouveau", channelType: "Text", category: null,
      })
    );
    expect(await screen.findByText("nouveau")).toBeInTheDocument();
  });

  it("owner peut supprimer un channel", async () => {
    mockAuthAs(mockOwner);
    mockInvokeByCommand([...SOCLE, "manage_channels"]);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    await userEvent.click(await screen.findByLabelText("Supprimer général"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild_channel", {
        guildId: "guild:1", channelId: "channel:1",
      })
    );
    expect(screen.queryByText("général")).not.toBeInTheDocument();
  });

  it("affiche le profil utilisateur en bas de la sidebar", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("En ligne")).toBeInTheDocument();
  });

  it("owner voit le bouton paramètres", async () => {
    mockAuthAs(mockOwner);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.getByLabelText("Paramètres du serveur")).toBeInTheDocument();
  });

  it("un membre voit aussi le bouton paramètres (onglets filtrés dans le modal)", async () => {
    mockAuthAs(mockMember);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.getByLabelText("Paramètres du serveur")).toBeInTheDocument();
  });
});
