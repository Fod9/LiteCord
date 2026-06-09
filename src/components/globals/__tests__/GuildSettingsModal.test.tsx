import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../context/GuildContext", () => ({ useGuild: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useGuild } from "../../../context/GuildContext";
import GuildSettingsModal from "../GuildSettingsModal";
import type { Guild } from "../../../services/guilds";

const mockGuild: Guild = {
  id: "guild:1",
  name: "Mon Serveur",
  icon: "",
  owner: "user:me",
  created_at: "2024-01-01T00:00:00Z",
};

const mockRoles = [
  { id: "role:1", guild: "guild:1", name: "Modérateur", color: "#5865F2", position: 1, permissions: [] },
  { id: "role:2", guild: "guild:1", name: "Membre", color: "#99AAB5", position: 2, permissions: [] },
];

const mockOnClose = vi.fn();
const mockOnDeleted = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
  vi.mocked(invoke).mockResolvedValue(mockRoles);
});

describe("GuildSettingsModal — Rôles", () => {
  it("charge et affiche les rôles dans l'onglet Rôles", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);

    await userEvent.click(screen.getByRole("tab", { name: /rôles/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_roles", { guildId: "guild:1" }));
    expect(await screen.findByText("Modérateur")).toBeInTheDocument();
    expect(screen.getByText("Membre")).toBeInTheDocument();
  });

  it("crée un rôle et l'ajoute à la liste", async () => {
    const newRole = { id: "role:3", guild: "guild:1", name: "Admin", color: "#ED4245", position: 0, permissions: [] };
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockRoles)
      .mockResolvedValueOnce(newRole);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /rôles/i }));
    await screen.findByText("Modérateur");

    await userEvent.type(screen.getByPlaceholderText(/nom du rôle/i), "Admin");
    await userEvent.click(screen.getByRole("button", { name: /ajouter le rôle/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_guild_role", {
        guildId: "guild:1", name: "Admin", color: "#99AAB5",
      })
    );
    expect(await screen.findByText("Admin")).toBeInTheDocument();
  });

  it("supprime un rôle", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockRoles)
      .mockResolvedValueOnce(undefined);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /rôles/i }));
    await screen.findByText("Modérateur");

    await userEvent.click(screen.getByLabelText("Supprimer Modérateur"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild_role", {
        guildId: "guild:1", roleId: "role:1",
      })
    );
    expect(screen.queryByText("Modérateur")).not.toBeInTheDocument();
  });
});

const mockInvites = [
  { id: "guild_invite:1", guild: "guild:1", inviter: "user:me", code: "AAAA1111", expires_at: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "guild_invite:2", guild: "guild:1", inviter: "user:me", code: "BBBB2222", expires_at: null, created_at: "2024-01-02T00:00:00Z" },
];

describe("GuildSettingsModal — Invitations", () => {
  it("affiche les invitations existantes", async () => {
    vi.mocked(invoke).mockResolvedValue(mockInvites);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /invitations/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_invites", { guildId: "guild:1" }));
    expect(await screen.findByText("AAAA1111")).toBeInTheDocument();
    expect(screen.getByText("BBBB2222")).toBeInTheDocument();
  });

  it("génère un nouveau code et l'ajoute à la liste", async () => {
    const newInvite = { id: "guild_invite:3", guild: "guild:1", inviter: "user:me", code: "CCCC3333", expires_at: null, created_at: "2024-01-03T00:00:00Z" };
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockInvites)
      .mockResolvedValueOnce(newInvite);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /invitations/i }));
    await screen.findByText("AAAA1111");

    await userEvent.click(screen.getByRole("button", { name: /générer un lien/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_guild_invite", { guildId: "guild:1" }));
    expect(await screen.findByText("CCCC3333")).toBeInTheDocument();
  });

  it("révoque une invitation", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(mockInvites)
      .mockResolvedValueOnce(undefined);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /invitations/i }));
    await screen.findByText("AAAA1111");

    await userEvent.click(screen.getByLabelText("Révoquer AAAA1111"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("revoke_guild_invite", { guildId: "guild:1", inviteId: "guild_invite:1" })
    );
    expect(screen.queryByText("AAAA1111")).not.toBeInTheDocument();
  });
});

const mockMembers = [
  { id: "member_of:1", user: { id: "user:me", name: "me", display_name: "Moi", profile_picture: "" }, roles: ["role:1"], nickname: null, joined_at: "2024-01-01T00:00:00Z" },
  { id: "member_of:2", user: { id: "user:bob", name: "bob", display_name: "Bob", profile_picture: "" }, roles: [], nickname: null, joined_at: "2024-01-02T00:00:00Z" },
];

describe("GuildSettingsModal — Membres", () => {
  function mockMembersInvoke() {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_guild_members") return mockMembers;
      if (cmd === "list_guild_roles") return [];
      return undefined;
    });
  }

  it("charge et affiche les membres", async () => {
    mockMembersInvoke();

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /membres/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_members", { guildId: "guild:1" }));
    expect(await screen.findByText("Moi")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("expulse un membre non-propriétaire", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_guild_members") return mockMembers;
      if (cmd === "list_guild_roles") return [];
      return undefined;
    });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /membres/i }));
    await screen.findByText("Bob");

    await userEvent.click(screen.getByLabelText("Expulser Bob"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("kick_guild_member", { guildId: "guild:1", userId: "user:bob" })
    );
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});

describe("GuildSettingsModal — Vue d'ensemble", () => {
  it("renomme le serveur", async () => {
    const updated = { ...mockGuild, name: "Nouveau Nom" };
    vi.mocked(invoke).mockResolvedValue(updated);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);

    const input = screen.getByDisplayValue("Mon Serveur");
    await userEvent.clear(input);
    await userEvent.type(input, "Nouveau Nom");
    await userEvent.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_guild", { guildId: "guild:1", name: "Nouveau Nom", icon: null })
    );
  });
});

describe("GuildSettingsModal — Danger", () => {
  it("supprimer le serveur appelle delete_guild et onDeleted", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(screen.getByRole("tab", { name: /danger/i }));
    await userEvent.click(screen.getByRole("button", { name: /supprimer le serveur/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild", { guildId: "guild:1" })
    );
    expect(mockOnDeleted).toHaveBeenCalled();
  });
});
