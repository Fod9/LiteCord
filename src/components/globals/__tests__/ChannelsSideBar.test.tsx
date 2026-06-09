import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../../../context/GuildContext", () => ({ useGuild: vi.fn() }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../../context/UnreadContext", () => ({ useUnread: vi.fn() }));
vi.mock("react-router", () => ({ useNavigate: vi.fn(), useParams: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGuild } from "../../../context/GuildContext";
import { useAuth } from "../../../context/AuthContext";
import { useUnread } from "../../../context/UnreadContext";
import { useNavigate, useParams } from "react-router";
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

const mockNavigate = vi.fn();
const mockOwner = { id: "user:me", name: "me", display_name: "Me", profile_picture: "" };
const mockMember = { id: "user:other", name: "other", display_name: "Other", profile_picture: "" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useParams).mockReturnValue({});
  vi.mocked(invoke).mockResolvedValue(mockChannels);
  vi.mocked(useUnread).mockReturnValue({ unread: {}, dmUnread: false, guildUnread: new Set(), markRead: vi.fn(), setActiveChannel: vi.fn(), registerChannel: vi.fn(), lockedChannels: new Set(), setChannelLocked: vi.fn() });
});

describe("ChannelsSideBar", () => {
  it("charge et affiche les channels du guild sélectionné", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockMember, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_guild_channels", { guildId: "guild:1" }));
    expect(await screen.findByText("général")).toBeInTheDocument();
    expect(screen.getByText("annonces")).toBeInTheDocument();
  });

  it("affiche le nom du guild en en-tête", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockMember, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);
    expect(await screen.findByText("Mon Serveur")).toBeInTheDocument();
  });

  it("affiche les channels Voice sous leur catégorie", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockMember, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);

    expect(await screen.findByText("Vocal")).toBeInTheDocument();
    expect(screen.getByText("vocal-général")).toBeInTheDocument();
  });

  it("clic sur un channel Text navigue vers la bonne route", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockMember, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);
    await userEvent.click(await screen.findByText("général"));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/guilds/guild:1/channels/channel:1",
      expect.objectContaining({ state: expect.objectContaining({ channel: mockChannels[0] }) })
    );
  });

  it("owner voit le bouton créer un channel", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockOwner, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.getByLabelText("Créer un channel")).toBeInTheDocument();
  });

  it("non-owner ne voit pas le bouton créer un channel", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockMember, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.queryByLabelText("Créer un channel")).not.toBeInTheDocument();
  });

  it("owner peut créer un channel Text", async () => {
    const newChannel = { id: "channel:99", guild: "guild:1", name: "nouveau", channel_type: "Text", category: null, created_at: "2024-01-01T00:00:00Z" };
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockOwner, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockChannels)
      .mockResolvedValueOnce(newChannel);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    await userEvent.click(screen.getByLabelText("Créer un channel"));
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
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockOwner, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockChannels)
      .mockResolvedValueOnce(undefined);

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    await userEvent.click(screen.getByLabelText("Supprimer général"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild_channel", {
        guildId: "guild:1", channelId: "channel:1",
      })
    );
    expect(screen.queryByText("général")).not.toBeInTheDocument();
  });

  it("owner voit le bouton paramètres", async () => {
    vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
    vi.mocked(useAuth).mockReturnValue({ user: mockOwner, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });

    render(<ChannelsSideBar />);
    await screen.findByText("général");

    expect(screen.getByLabelText("Paramètres du serveur")).toBeInTheDocument();
  });
});
