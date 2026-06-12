import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("react-router", () => ({ useNavigate: vi.fn() }));
vi.mock("../../../context/GuildContext", () => ({ useGuild: vi.fn() }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../../context/UnreadContext", () => ({ useUnread: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router";
import { useGuild } from "../../../context/GuildContext";
import { useAuth } from "../../../context/AuthContext";
import { useUnread } from "../../../context/UnreadContext";
import ServerSideBar from "../ServerSideBar";

const mockGuilds = [
  { id: "guild:1", name: "Mon Serveur", icon: "", owner: "user:me", created_at: "2024-01-01T00:00:00Z" },
  { id: "guild:2", name: "Gaming", icon: "🎮", owner: "user:other", created_at: "2024-01-02T00:00:00Z" },
];

const mockSelectGuild = vi.fn();
const mockNavigate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue(mockGuilds);
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useGuild).mockReturnValue({ selectedGuild: null, selectGuild: mockSelectGuild, lastVisited: {}, setLastVisited: vi.fn() });
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user:me", name: "me", display_name: "Me", profile_picture: "" }, isLoading: false, wsStatus: "connected" as const, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
  vi.mocked(useUnread).mockReturnValue({ unread: {}, dmUnread: false, guildUnread: new Set(), markRead: vi.fn(), setActiveChannel: vi.fn(), registerChannel: vi.fn(), lockedChannels: new Set(), setChannelLocked: vi.fn(), pendingFriendRequests: 0, setPendingFriendRequests: vi.fn(), registerFriendPendingRefresh: vi.fn(), registerFriendListRefresh: vi.fn() } as ReturnType<typeof useUnread>);
});

describe("ServerSideBar", () => {
  it("affiche toujours le bouton home", async () => {
    render(<ServerSideBar />);
    expect(screen.getByLabelText("Messages privés")).toBeInTheDocument();
  });

  it("charge et affiche les guilds", async () => {
    render(<ServerSideBar />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guilds"));
    expect(await screen.findByLabelText("Mon Serveur")).toBeInTheDocument();
    expect(screen.getByLabelText("Gaming")).toBeInTheDocument();
  });

  it("affiche les initiales pour un guild sans icone", async () => {
    render(<ServerSideBar />);
    const btn = await screen.findByLabelText("Mon Serveur");
    expect(btn).toHaveTextContent("MS");
  });

  it("affiche l'emoji pour un guild avec icone", async () => {
    render(<ServerSideBar />);
    const btn = await screen.findByLabelText("Gaming");
    expect(btn).toHaveTextContent("🎮");
  });

  it("ouvre la modal au clic sur '+'", async () => {
    render(<ServerSideBar />);
    await screen.findByLabelText("Mon Serveur");
    await userEvent.click(screen.getByLabelText("Ajouter un serveur"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("crée un guild via la modal et l'ajoute à la liste", async () => {
    const newGuild = { id: "guild:3", name: "Nouveau", icon: "", owner: "user:me", created_at: "2024-01-03T00:00:00Z" };
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockGuilds)
      .mockResolvedValueOnce(newGuild);

    render(<ServerSideBar />);
    await screen.findByLabelText("Mon Serveur");

    await userEvent.click(screen.getByLabelText("Ajouter un serveur"));
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    await userEvent.type(screen.getByPlaceholderText(/nom du serveur/i), "Nouveau");
    await userEvent.click(screen.getByRole("button", { name: /créer le serveur/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_guild", { name: "Nouveau", icon: "" })
    );
    expect(await screen.findByLabelText("Nouveau")).toBeInTheDocument();
  });

  it("sélectionne un guild au clic", async () => {
    render(<ServerSideBar />);
    const btn = await screen.findByLabelText("Mon Serveur");
    await userEvent.click(btn);
    expect(mockSelectGuild).toHaveBeenCalledWith(mockGuilds[0]);
  });

  it("rejoint un guild via la modal et l'ajoute à la liste", async () => {
    const joinedGuild = { id: "guild:4", name: "Rejoint", icon: "🚀", owner: "user:other", created_at: "2024-01-04T00:00:00Z" };
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockGuilds)
      .mockResolvedValueOnce(joinedGuild);

    render(<ServerSideBar />);
    await screen.findByLabelText("Mon Serveur");

    await userEvent.click(screen.getByLabelText("Ajouter un serveur"));
    await userEvent.click(screen.getByRole("button", { name: /rejoindre/i }));
    await userEvent.type(screen.getByPlaceholderText(/code d'invitation/i), "ABCD1234");
    await userEvent.click(screen.getByRole("button", { name: /rejoindre le serveur/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("join_guild", { code: "ABCD1234" })
    );
    expect(await screen.findByLabelText("Rejoint")).toBeInTheDocument();
  });
});
