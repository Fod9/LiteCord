export interface PermissionDef {
  id: string;
  label: string;
  description: string;
}

export interface PermissionCategory {
  label: string;
  permissions: PermissionDef[];
}

// Vocabulaire canonique — doit rester aligné avec le backend (API.md § Permissions).
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    label: "Serveur",
    permissions: [
      { id: "administrator", label: "Administrateur", description: "Accorde toutes les permissions et contourne les restrictions de channel." },
      { id: "manage_guild", label: "Gérer le serveur", description: "Modifier le nom et l'icône du serveur." },
      { id: "manage_roles", label: "Gérer les rôles", description: "Créer, modifier, supprimer des rôles et les assigner aux membres." },
      { id: "manage_channels", label: "Gérer les channels", description: "Créer, modifier et supprimer des channels." },
      { id: "create_invite", label: "Créer des invitations", description: "Générer des codes d'invitation." },
      { id: "manage_invites", label: "Gérer les invitations", description: "Lister et révoquer les invitations du serveur." },
    ],
  },
  {
    label: "Membres",
    permissions: [
      { id: "kick_members", label: "Expulser des membres", description: "Expulser des membres du serveur." },
      { id: "ban_members", label: "Bannir des membres", description: "Bannir définitivement des membres du serveur." },
      { id: "manage_nicknames", label: "Gérer les pseudos", description: "Modifier le pseudo des autres membres." },
    ],
  },
  {
    label: "Channels textuels",
    permissions: [
      { id: "view_channels", label: "Voir les channels", description: "Voir les channels et lire l'historique des messages." },
      { id: "send_messages", label: "Envoyer des messages", description: "Envoyer des messages dans les channels textuels." },
      { id: "attach_files", label: "Joindre des fichiers", description: "Envoyer des pièces jointes." },
      { id: "manage_messages", label: "Gérer les messages", description: "Supprimer les messages des autres membres." },
      { id: "mention_everyone", label: "Mentionner @everyone", description: "Notifier tous les membres d'un channel." },
    ],
  },
  {
    label: "Channels vocaux",
    permissions: [
      { id: "connect", label: "Se connecter", description: "Rejoindre les channels vocaux." },
      { id: "speak", label: "Parler", description: "Émettre de l'audio dans les channels vocaux." },
      { id: "mute_members", label: "Rendre muet", description: "Couper le micro d'autres membres." },
      { id: "move_members", label: "Déplacer des membres", description: "Déplacer des membres entre channels vocaux." },
    ],
  },
];

export const ALL_PERMISSION_IDS: readonly string[] = PERMISSION_CATEGORIES.flatMap(
  (c) => c.permissions.map((p) => p.id)
);

export function permissionLabel(id: string): string {
  for (const cat of PERMISSION_CATEGORIES) {
    const def = cat.permissions.find((p) => p.id === id);
    if (def) return def.label;
  }
  return id;
}

/**
 * Traduit les erreurs au format stable de l'API (cf. API.md § Permissions)
 * en message lisible. Retourne le texte brut si l'erreur n'est pas structurée.
 * Gère aussi le format WS `missing_permission:<id>`.
 */
export function parseApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  const wsMatch = raw.match(/^missing_permission:([a-z_]+)$/);
  if (wsMatch) return `Permission manquante : ${permissionLabel(wsMatch[1])}`;

  try {
    const parsed = JSON.parse(raw);
    switch (parsed.error) {
      case "missing_permission":
        return `Permission manquante : ${permissionLabel(parsed.permission)}`;
      case "role_hierarchy":
        return "Votre rôle est trop bas dans la hiérarchie pour faire cela.";
      case "not_member":
        return "Vous n'êtes pas membre de ce serveur.";
      case "unknown_permissions":
        return `Permissions inconnues : ${(parsed.permissions ?? []).join(", ")}`;
    }
  } catch {
    // pas du JSON — texte brut
  }
  return raw;
}
