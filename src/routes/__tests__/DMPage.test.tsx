import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("react-router", () => ({ useParams: vi.fn(), useLocation: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../context/UnreadContext", () => ({ useUnread: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useParams, useLocation } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useUnread } from "../../context/UnreadContext";
import DMPage from "../DMPage";

const CHANNEL_ID = "DMChannel:abc";

const mockMessages = [
  {
    id: "message:001",
    channel: CHANNEL_ID,
    author: { id: "user:xyz", name: "xyz", display_name: "Alice", profile_picture: "" },
    content: "Bonjour !",
    reply_to: null,
    edited_at: null,
    created_at: "2024-01-01T10:00:00Z",
  },
  {
    id: "message:002",
    channel: CHANNEL_ID,
    author: { id: "user:me", name: "Me", display_name: "Moi", profile_picture: "" },
    content: "Salut !",
    reply_to: null,
    edited_at: null,
    created_at: "2024-01-01T10:01:00Z",
  },
];

const mockUser = { id: "user:me", name: "Me", display_name: "Moi", profile_picture: "" };
const mockChannel = {
  id: CHANNEL_ID,
  name: null,
  owner: "user:me",
  participants: [
    { id: "user:me", name: "Me", display_name: "Moi", profile_picture: "" },
    { id: "user:xyz", name: "Alice", display_name: "Alice", profile_picture: "" },
  ],
  last_message_id: null,
  created_at: "2024-01-01T00:00:00Z",
};

function mockUnread(lockedChannels: Set<string> = new Set()) {
  vi.mocked(useUnread).mockReturnValue({
    unread: {},
    dmUnread: false,
    guildUnread: new Set(),
    markRead: vi.fn(),
    setActiveChannel: vi.fn(),
    registerChannel: vi.fn(),
    lockedChannels,
    setChannelLocked: vi.fn(),
  } as ReturnType<typeof useUnread>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useParams).mockReturnValue({ channelId: CHANNEL_ID });
  vi.mocked(useLocation).mockReturnValue({ state: { channel: mockChannel }, pathname: `/channels/${CHANNEL_ID}`, search: "", hash: "", key: "default" });
  vi.mocked(useAuth).mockReturnValue({ user: mockUser, isLoading: false, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
  vi.mocked(listen).mockResolvedValue(() => {});
  mockUnread();
});

describe("DMPage", () => {
  it("charge et affiche l'historique des messages", async () => {
    vi.mocked(invoke).mockResolvedValue(mockMessages);

    render(<DMPage />);

    await waitFor(() => expect(screen.getByText("Bonjour !")).toBeInTheDocument());
    expect(screen.getByText("Salut !")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("get_channel_messages", { channelId: CHANNEL_ID });
  });

  it("affiche le display_name de l'utilisateur courant et le nom du channel pour l'autre", async () => {
    vi.mocked(invoke).mockResolvedValue(mockMessages);

    render(<DMPage />);

    await waitFor(() => screen.getByText("Bonjour !"));
    // user:xyz → nom du channel ("Alice"), user:me → display_name ("Moi")
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getByText("Moi")).toBeInTheDocument();
  });

  it("affiche un message vide si aucun historique", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    render(<DMPage />);

    await waitFor(() =>
      expect(screen.getByText("Aucun message pour le moment.")).toBeInTheDocument()
    );
  });

  it("ajoute un nouveau message reçu via WS sans recharger", async () => {
    vi.mocked(invoke).mockResolvedValue(mockMessages);

    const wsCallbacks: Record<string, (event: { payload: unknown }) => void> = {};
    vi.mocked(listen).mockImplementation(async (event, cb) => {
      wsCallbacks[event as string] = cb as (event: { payload: unknown }) => void;
      return () => {};
    });

    render(<DMPage />);
    await waitFor(() => screen.getByText("Bonjour !"));

    const newMsg = {
      id: "message:003",
      channel: CHANNEL_ID,
      author: { id: "user:xyz", name: "xyz", display_name: "Alice", profile_picture: "" },
      content: "Un nouveau message !",
      reply_to: null,
      edited_at: null,
      created_at: "2024-01-01T10:02:00Z",
    };

    act(() => wsCallbacks["new-message"]?.({ payload: newMsg }));

    expect(screen.getByText("Un nouveau message !")).toBeInTheDocument();
  });

  it("envoie un message via WS et vide l'input", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockMessages)
      .mockResolvedValueOnce(undefined);

    render(<DMPage />);
    await waitFor(() => screen.getByText("Bonjour !"));

    const input = screen.getByPlaceholderText(/message/i);
    await act(() => userEvent.type(input, "Test envoi{Enter}"));

    expect(invoke).toHaveBeenCalledWith("send_ws_message", {
      to: CHANNEL_ID,
      content: "Test envoi",
    });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("affiche le message verrouillé quand le canal est verrouillé", async () => {
    mockUnread(new Set([CHANNEL_ID]));
    vi.mocked(invoke).mockResolvedValue([]);

    render(<DMPage />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/plus amis/i)).toBeInTheDocument();
  });

  it("n'envoie pas si le message est vide", async () => {
    vi.mocked(invoke).mockResolvedValue(mockMessages);

    render(<DMPage />);
    await waitFor(() => screen.getByText("Bonjour !"));

    const input = screen.getByPlaceholderText(/message/i);
    await act(() => userEvent.type(input, "{Enter}"));

    // invoke appelé une seule fois (le chargement initial)
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
