import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../../../context/GuildContext", () => ({ useGuild: vi.fn() }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGuild } from "../../../context/GuildContext";
import { useAuth } from "../../../context/AuthContext";
import GuildSettingsModal from "../GuildSettingsModal";
import { ALL_PERMISSION_IDS } from "../../../services/permissions";
import type { Guild } from "../../../services/guilds";

const mockGuild: Guild = {
  id: "guild:1",
  name: "Mon Serveur",
  icon: "",
  owner: "user:me",
  created_at: "2024-01-01T00:00:00Z",
};

const mockRoles = [
  { id: "role:1", guild: "guild:1", name: "Modérateur", color: "#5865F2", position: 1, permissions: ["kick_members"] },
  { id: "role:2", guild: "guild:1", name: "Membre", color: "#99AAB5", position: 2, permissions: [] },
];

const mockMembers = [
  { id: "member_of:1", user: { id: "user:me", name: "me", display_name: "Moi", profile_picture: "" }, roles: ["role:1"], nickname: null, joined_at: "2024-01-01T00:00:00Z" },
  { id: "member_of:2", user: { id: "user:bob", name: "bob", display_name: "Bob", profile_picture: "" }, roles: [], nickname: null, joined_at: "2024-01-02T00:00:00Z" },
];

const mockInvites = [
  { id: "guild_invite:1", guild: "guild:1", inviter: "user:me", code: "AAAA1111", expires_at: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "guild_invite:2", guild: "guild:1", inviter: "user:me", code: "BBBB2222", expires_at: null, created_at: "2024-01-02T00:00:00Z" },
];

const SOCLE = ["view_channels", "send_messages", "attach_files", "create_invite", "connect", "speak"];

const mockOnClose = vi.fn();
const mockOnDeleted = vi.fn();

const owner = { id: "user:me", name: "me", display_name: "Moi", profile_picture: "" };
const member = { id: "user:bob", name: "bob", display_name: "Bob", profile_picture: "" };

function mockAuthAs(user: typeof owner) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, wsStatus: "connected" as const, login: vi.fn(), signup: vi.fn(), logout: vi.fn() });
}

/** Mock d'invoke par commande — l'ordre des appels n'a pas d'importance. */
function mockInvokeByCommand(myPermissions: string[], overrides: Record<string, unknown> = {}) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd in overrides) {
      const v = overrides[cmd];
      return typeof v === "function" ? (v as () => unknown)() : v;
    }
    if (cmd === "get_my_guild_member") return { member: mockMembers[0], permissions: myPermissions };
    if (cmd === "list_guild_roles") return mockRoles;
    if (cmd === "list_guild_members") return mockMembers;
    if (cmd === "list_guild_invites") return mockInvites;
    return undefined;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listen).mockResolvedValue(() => {});
  vi.mocked(useGuild).mockReturnValue({ selectedGuild: mockGuild, selectGuild: vi.fn(), lastVisited: {}, setLastVisited: vi.fn() });
  mockAuthAs(owner);
  mockInvokeByCommand([...ALL_PERMISSION_IDS]);
});

describe("GuildSettingsModal — Rôles", () => {
  it("charge et affiche les rôles dans l'onglet Rôles", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);

    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_roles", { guildId: "guild:1" }));
    expect(await screen.findByText("Modérateur")).toBeInTheDocument();
    expect(screen.getByText("Membre")).toBeInTheDocument();
  });

  it("crée un rôle en queue de hiérarchie (position max + 1)", async () => {
    const newRole = { id: "role:3", guild: "guild:1", name: "Admin", color: "#ED4245", position: 3, permissions: [] };
    mockInvokeByCommand([...ALL_PERMISSION_IDS], { create_guild_role: newRole });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await screen.findByText("Modérateur");

    await userEvent.type(screen.getByPlaceholderText(/nom du rôle/i), "Admin");
    await userEvent.click(screen.getByRole("button", { name: /ajouter le rôle/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_guild_role", {
        guildId: "guild:1", name: "Admin", color: "#99AAB5", permissions: [], position: 3,
      })
    );
    expect(await screen.findByText("Admin")).toBeInTheDocument();
  });

  it("ne duplique pas le rôle quand l'écho WebSocket role-created arrive avant la réponse HTTP", async () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(listen).mockImplementation(async (event: string, handler: any) => {
      listeners[event] = handler;
      return () => {};
    });

    const newRole = { id: "role:3", guild: "guild:1", name: "Admin", color: "#99AAB5", position: 3, permissions: [] };
    mockInvokeByCommand([...ALL_PERMISSION_IDS], {
      // Le serveur broadcast l'événement WS avant que la réponse HTTP ne résolve
      create_guild_role: () => {
        listeners["role-created"]?.({ payload: newRole, event: "role-created", id: 1 });
        return newRole;
      },
    });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await screen.findByText("Modérateur");

    await userEvent.type(screen.getByPlaceholderText(/nom du rôle/i), "Admin");
    await userEvent.click(screen.getByRole("button", { name: /ajouter le rôle/i }));

    await screen.findAllByText("Admin");
    expect(screen.getAllByText("Admin")).toHaveLength(1);
  });

  it("supprime un rôle", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await screen.findByText("Modérateur");

    await userEvent.click(screen.getByLabelText("Supprimer Modérateur"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild_role", {
        guildId: "guild:1", roleId: "role:1",
      })
    );
    expect(screen.queryByText("Modérateur")).not.toBeInTheDocument();
  });

  it("monte un rôle dans la hiérarchie en échangeant les positions", async () => {
    mockInvokeByCommand([...ALL_PERMISSION_IDS], {
      update_guild_role: () => ({ ...mockRoles[1] }),
    });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await screen.findByText("Membre");

    await userEvent.click(screen.getByLabelText("Monter Membre"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("update_guild_role", expect.objectContaining({ roleId: "role:2", position: 1 }));
      expect(invoke).toHaveBeenCalledWith("update_guild_role", expect.objectContaining({ roleId: "role:1", position: 2 }));
    });
  });

  it("affiche l'éditeur de permissions au clic sur un rôle, avec l'état actuel", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await userEvent.click(await screen.findByText("Modérateur"));

    const kick = await screen.findByRole("checkbox", { name: /expulser des membres/i });
    expect(kick).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /gérer les channels/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /administrateur/i })).toBeInTheDocument();
  });

  it("modifie les permissions d'un rôle et enregistre via update_guild_role", async () => {
    const updated = { ...mockRoles[0], permissions: ["kick_members", "manage_channels"] };
    mockInvokeByCommand([...ALL_PERMISSION_IDS], { update_guild_role: updated });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await userEvent.click(await screen.findByText("Modérateur"));

    await userEvent.click(await screen.findByRole("checkbox", { name: /gérer les channels/i }));
    await userEvent.click(screen.getByRole("button", { name: /enregistrer le rôle/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_guild_role", expect.objectContaining({
        guildId: "guild:1",
        roleId: "role:1",
        permissions: expect.arrayContaining(["kick_members", "manage_channels"]),
      }))
    );
  });

  it("anti-escalade : désactive les permissions que l'utilisateur ne possède pas", async () => {
    mockAuthAs(member);
    // bob a manage_roles + kick_members mais pas manage_channels
    mockInvokeByCommand([...SOCLE, "manage_roles", "kick_members"]);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await userEvent.click(await screen.findByText("Modérateur"));

    expect(await screen.findByRole("checkbox", { name: /gérer les channels/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /expulser des membres/i })).toBeEnabled();
  });

  it("affiche l'erreur de hiérarchie traduite quand le serveur refuse", async () => {
    mockInvokeByCommand([...ALL_PERMISSION_IDS], {
      update_guild_role: () => { throw '{"error": "role_hierarchy"}'; },
    });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /rôles/i }));
    await userEvent.click(await screen.findByText("Modérateur"));
    await userEvent.click(screen.getByRole("button", { name: /enregistrer le rôle/i }));

    expect(await screen.findByText(/hiérarchie/i)).toBeInTheDocument();
  });
});

describe("GuildSettingsModal — Invitations", () => {
  it("affiche les invitations existantes", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /invitations/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_invites", { guildId: "guild:1" }));
    expect(await screen.findByText("AAAA1111")).toBeInTheDocument();
    expect(screen.getByText("BBBB2222")).toBeInTheDocument();
  });

  it("génère un nouveau code et l'ajoute à la liste", async () => {
    const newInvite = { id: "guild_invite:3", guild: "guild:1", inviter: "user:me", code: "CCCC3333", expires_at: null, created_at: "2024-01-03T00:00:00Z" };
    mockInvokeByCommand([...ALL_PERMISSION_IDS], { create_guild_invite: newInvite });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /invitations/i }));
    await screen.findByText("AAAA1111");

    await userEvent.click(screen.getByRole("button", { name: /générer un lien/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_guild_invite", { guildId: "guild:1" }));
    expect(await screen.findByText("CCCC3333")).toBeInTheDocument();
  });

  it("révoque une invitation", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /invitations/i }));
    await screen.findByText("AAAA1111");

    await userEvent.click(screen.getByLabelText("Révoquer AAAA1111"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("revoke_guild_invite", { guildId: "guild:1", inviteId: "guild_invite:1" })
    );
    expect(screen.queryByText("AAAA1111")).not.toBeInTheDocument();
  });
});

describe("GuildSettingsModal — Membres", () => {
  it("charge et affiche les membres", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /membres/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_guild_members", { guildId: "guild:1" }));
    expect(await screen.findByText("Moi")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("expulse un membre non-propriétaire", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /membres/i }));
    await screen.findByText("Bob");

    await userEvent.click(screen.getByLabelText("Expulser Bob"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("kick_guild_member", { guildId: "guild:1", userId: "user:bob" })
    );
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("affiche l'erreur traduite quand le kick est refusé par la hiérarchie", async () => {
    mockInvokeByCommand([...ALL_PERMISSION_IDS], {
      kick_guild_member: () => { throw '{"error": "role_hierarchy"}'; },
    });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /membres/i }));
    await screen.findByText("Bob");

    await userEvent.click(screen.getByLabelText("Expulser Bob"));

    expect(await screen.findByText(/hiérarchie/i)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument(); // pas retiré de la liste
  });
});

describe("GuildSettingsModal — gating par permissions", () => {
  it("un membre avec le socle par défaut ne voit ni Rôles ni Danger, et pas de bouton Expulser", async () => {
    mockAuthAs(member);
    mockInvokeByCommand(SOCLE);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_my_guild_member", { guildId: "guild:1" }));
    expect(screen.queryByRole("tab", { name: /rôles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /danger/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /membres/i }));
    await screen.findByText("Moi");
    expect(screen.queryByLabelText(/expulser/i)).not.toBeInTheDocument();
  });

  it("un membre avec kick_members voit Expulser (sauf owner et soi-même) mais pas l'onglet Rôles", async () => {
    mockAuthAs(member);
    mockInvokeByCommand([...SOCLE, "kick_members"]);

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_my_guild_member", { guildId: "guild:1" }));

    expect(screen.queryByRole("tab", { name: /rôles/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /membres/i }));
    await screen.findByText("Moi");
    expect(screen.queryByLabelText("Expulser Moi")).not.toBeInTheDocument(); // owner
    expect(screen.queryByLabelText("Expulser Bob")).not.toBeInTheDocument(); // soi-même
  });
});

describe("GuildSettingsModal — Vue d'ensemble", () => {
  it("renomme le serveur", async () => {
    mockInvokeByCommand([...ALL_PERMISSION_IDS], { update_guild: { ...mockGuild, name: "Nouveau Nom" } });

    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);

    // le formulaire ne devient éditable qu'une fois manage_guild résolu
    const saveBtn = await screen.findByRole("button", { name: /enregistrer/i });
    const input = screen.getByDisplayValue("Mon Serveur");
    await userEvent.clear(input);
    await userEvent.type(input, "Nouveau Nom");
    await userEvent.click(saveBtn);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_guild", { guildId: "guild:1", name: "Nouveau Nom", icon: null })
    );
  });
});

describe("GuildSettingsModal — Danger", () => {
  it("supprimer le serveur appelle delete_guild et onDeleted", async () => {
    render(<GuildSettingsModal guild={mockGuild} onClose={mockOnClose} onDeleted={mockOnDeleted} />);
    await userEvent.click(await screen.findByRole("tab", { name: /danger/i }));
    await userEvent.click(screen.getByRole("button", { name: /supprimer le serveur/i }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_guild", { guildId: "guild:1" })
    );
    expect(mockOnDeleted).toHaveBeenCalled();
  });
});
