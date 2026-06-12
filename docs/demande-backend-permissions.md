# Demande backend — Permissions fines sur rôles et membres

**De :** équipe frontend LiteCord
**Objet :** support backend pour un système de permissions paramétrable par rôle (et, à terme, par channel et par membre)
**État côté frontend :** l'éditeur de rôles avec permissions fines est déjà implémenté et **déjà câblé** sur les contrats décrits en §3 — seuls les points marqués ⚠️ bloquent.

---

## 1. Contexte et objectif

L'API expose déjà `permissions: ["string"]` sur les rôles (`POST /guilds/<gid>/roles` l'accepte, `GET /guilds/<gid>/roles` le retourne), mais :

1. **Aucun vocabulaire de permissions n'est défini** — le champ est libre et n'a aucun effet.
2. **Aucun endpoint ne permet de modifier un rôle existant** — impossible de changer les permissions d'un rôle sans le supprimer (ce qui retire le rôle de tous les membres).
3. **Aucune route ne vérifie les permissions** — tout est « réservé au propriétaire » (gestion) ou « réservé aux membres » (lecture, création de channels/invitations).

Objectif : que le propriétaire puisse déléguer finement (ex. un rôle « Modérateur » qui peut expulser et gérer les messages, un rôle « Builder » qui peut gérer les channels), sans donner les pleins pouvoirs.

Le frontend calcule déjà les permissions effectives localement pour afficher/masquer l'UI, mais **sans enforcement serveur c'est purement cosmétique** : n'importe quel client peut appeler les routes directement.

---

## 2. Vocabulaire canonique des permissions

Le frontend utilise déjà ces identifiants (snake_case, stockés tels quels dans `permissions`). Merci de valider ce vocabulaire ensemble avant implémentation — c'est le contrat partagé.

### Serveur
| ID | Effet |
|---|---|
| `administrator` | Accorde **toutes** les permissions, contourne les futurs overrides de channel. Ne peut être accordé que par le owner ou un autre admin. |
| `manage_guild` | Modifier nom/icône du serveur (`PATCH /guilds/<gid>`) |
| `manage_roles` | CRUD des rôles + assignation/retrait aux membres |
| `manage_channels` | Créer/supprimer (et plus tard modifier) des channels |
| `create_invite` | Générer des codes d'invitation |
| `manage_invites` | Lister et révoquer les invitations |

### Membres
| ID | Effet |
|---|---|
| `kick_members` | Expulser des membres |
| `ban_members` | Bannir/débannir (nécessite de nouveaux endpoints — voir §7) |
| `manage_nicknames` | Modifier le pseudo des autres membres (voir §7) |

### Channels textuels
| ID | Effet |
|---|---|
| `view_channels` | Voir les channels et lire l'historique |
| `send_messages` | Envoyer des messages (HTTP futur + **WS dès maintenant**) |
| `attach_files` | Joindre des fichiers aux messages |
| `manage_messages` | Supprimer les messages des autres (voir §7) |
| `mention_everyone` | Notifier tous les membres (voir §7) |

### Channels vocaux (réservé pour la feature vocal)
| ID | Effet |
|---|---|
| `connect` | Rejoindre un channel vocal |
| `speak` | Émettre de l'audio |
| `mute_members` | Couper le micro d'autrui |
| `move_members` | Déplacer des membres entre channels vocaux |

### Sémantique transverse

- **Owner** : possède implicitement toutes les permissions, ne peut être ni kické ni rétrogradé. Inchangé : `DELETE /guilds/<gid>` reste owner-only.
- **Socle par défaut (@everyone implicite)** : tout membre, même sans rôle, possède :
  `view_channels`, `send_messages`, `attach_files`, `create_invite`, `connect`, `speak`.
  (Si vous préférez matérialiser un rôle `@everyone` par guild plutôt qu'un socle codé en dur, le front s'adapte — dites-le-nous, voir §9.)
- **Cumul** : permissions effectives = socle ∪ permissions de tous les rôles assignés (union, pas d'ordre).
- **Validation** : toute valeur hors vocabulaire dans `permissions` → `400` avec la liste des valeurs refusées.

---

## 3. ⚠️ P0 — Bloquant : modification de rôle + enforcement

### 3.1 `PATCH /guilds/<gid>/roles/<role_id>` 🔒

**Le frontend appelle déjà cet endpoint** (éditeur de permissions dans les paramètres du serveur). Contrat attendu :

**Corps** — tous les champs optionnels, champ absent = conservé :
```json
{
  "name": "string",
  "color": "string",
  "position": 1,
  "permissions": ["kick_members", "manage_messages"]
}
```

**Retour** `200` — l'objet Role complet mis à jour (même forme que `GET /roles`).

**Erreurs**
- `400` — permission inconnue dans `permissions` (préciser lesquelles dans le corps)
- `403` — l'appelant n'a pas `manage_roles` (ou viole la hiérarchie, voir §5)
- `404` — rôle introuvable ou n'appartenant pas à ce guild

**Événement WS** à tous les membres du serveur (le front doit recalculer les permissions et re-render sans refresh) :
```json
{
  "message_type": "role_modified",
  "content": "{ ...Role complet }"
}
```

### 3.2 Enforcement par permission sur les routes existantes

Remplacer les checks « owner-only » / « member-only » par des checks de permission. Matrice complète :

| Route | Aujourd'hui | Permission requise |
|---|---|---|
| `PATCH /guilds/<gid>` | owner | `manage_guild` |
| `POST /guilds/<gid>/channels` | **tout membre** ⚠️ | `manage_channels` |
| `DELETE /guilds/<gid>/channels/<chid>` | owner | `manage_channels` |
| `POST /guilds/<gid>/invites` | tout membre | `create_invite` |
| `GET /guilds/<gid>/invites` | owner | `manage_invites` |
| `DELETE /guilds/<gid>/invites/<iid>` | owner | `manage_invites` |
| `POST /guilds/<gid>/members/<uid>/kick` | owner | `kick_members` |
| `POST /guilds/<gid>/roles` | owner | `manage_roles` |
| `PATCH /guilds/<gid>/roles/<rid>` *(nouveau)* | — | `manage_roles` |
| `DELETE /guilds/<gid>/roles/<rid>` | owner | `manage_roles` |
| `POST/DELETE /guilds/<gid>/members/<uid>/roles/<rid>` | owner | `manage_roles` |
| `DELETE /guilds/<gid>` | owner | owner (inchangé) |
| `GET` channels / members / roles | membre | membre (inchangé en P0, voir §6) |

⚠️ Note : `POST /channels` est aujourd'hui ouvert à **tout membre** — c'est une régression volontaire et souhaitée (le front masque déjà le bouton pour qui n'a pas `manage_channels`).

### 3.3 Enforcement WS (envoi de messages)

À la réception d'un message `to: "channel:<id>"` :
- expéditeur non membre du guild → rejet
- sans `send_messages` → rejet
- avec `attachments` non vide sans `attach_files` → rejet

Rejet via l'événement d'erreur existant, mais avec un code stable (cf. §3.4) :
```json
{ "message_type": "error", "content": "missing_permission:send_messages" }
```

### 3.4 Format d'erreur stable

Aujourd'hui les erreurs sont du texte libre. Pour que le front affiche un message utile (« Il vous manque la permission *Gérer les channels* »), il faut un format parsable. Proposition minimale sans casser l'existant :

- HTTP `403` avec corps texte `missing_permission:<permission_id>`
- ou mieux, JSON : `{ "error": "missing_permission", "permission": "manage_channels" }`

Dites-nous lequel vous retenez.

---

## 4. P0 bis — Création de rôle (déjà presque OK)

`POST /guilds/<gid>/roles` accepte déjà `permissions` : il faut juste y ajouter la **validation du vocabulaire** (§2) et passer le check d'accès de owner-only à `manage_roles`. Le front envoie déjà `permissions: []` à la création puis configure via PATCH.

---

## 5. P1 — Hiérarchie des rôles

Sans hiérarchie, un modérateur avec `manage_roles` peut s'auto-attribuer `administrator`. Règles demandées (toutes contournées par owner et `administrator`) :

- **Convention** : `position` plus petite = rôle plus élevé (le tri actuel `ORDER BY position ASC` affiche donc du plus haut au plus bas). Confirmez-nous la convention retenue, le front s'aligne.
- Un utilisateur ne peut **créer/modifier/supprimer** que des rôles strictement inférieurs à son rôle le plus élevé.
- Un utilisateur ne peut **assigner/retirer** que des rôles strictement inférieurs à son rôle le plus élevé.
- Impossible d'accorder une permission qu'on ne possède pas soi-même (sinon escalade via création de rôle).
- `kick_members` (et plus tard `ban_members`) : seulement si le rôle le plus élevé de la cible est strictement inférieur au sien ; l'owner n'est jamais kickable.
- Erreur dédiée : `403` `role_hierarchy` (même format que §3.4).

---

## 6. P1 — Événements temps réel & confort

### 6.1 Événements WS sur le cycle de vie des rôles

Aujourd'hui seul `role_updated` (assignation/retrait) existe. Il manque, diffusés à tous les membres du guild :

```json
{ "message_type": "role_created",  "content": "{ ...Role }" }
{ "message_type": "role_modified", "content": "{ ...Role }" }
{ "message_type": "role_deleted",  "content": "{\"guild_id\": \"guild:<id>\", \"role_id\": \"role:<id>\"}" }
```

(`role_updated` garde sa sémantique actuelle d'assignation pour ne rien casser.)

### 6.2 `GET /guilds/<gid>/members/me` 🔒 (confort, optionnel)

```json
{
  "member": { ...GuildMember },
  "permissions": ["view_channels", "send_messages", "..."]
}
```

Permissions **calculées côté serveur**. Évite toute dérive entre le calcul front et le calcul back, et économise le couple `GET /members` + `GET /roles` que le front fait aujourd'hui à chaque sélection de serveur. Si vous l'ajoutez, le front bascule dessus.

---

## 7. P2 — Extensions nécessitant de nouveaux endpoints

Le vocabulaire (§2) les couvre déjà pour ne pas migrer deux fois, mais chacune demande de nouvelles routes :

1. **Overrides par channel** (la vraie « finesse » à terme) :
   - Champ `permission_overwrites` sur l'objet Channel :
     ```json
     [{ "target": "role:<id> | user:<id>", "allow": ["send_messages"], "deny": ["view_channels"] }]
     ```
   - `PUT /guilds/<gid>/channels/<chid>/permissions` (remplace la liste entière) — requiert `manage_channels`.
   - Résolution : socle+rôles → deny rôles → allow rôles → deny user → allow user ; `administrator` ignore tout.
   - Conséquences : `GET /channels` filtré par `view_channels`, `GET /messages` → `403` sans `view_channels`, WS idem, événement `channel_permissions_updated`.
2. **`ban_members`** : `POST /guilds/<gid>/members/<uid>/ban`, `DELETE .../ban`, `GET /guilds/<gid>/bans` + refus de re-join par invitation.
3. **`manage_messages`** : `DELETE /channels/<chid>/messages/<mid>` (auteur **ou** `manage_messages`) + événement WS `message_deleted`.
4. **`manage_nicknames`** : `PATCH /guilds/<gid>/members/<uid>` `{ "nickname": "..." }`.
5. **`mention_everyone`** : à enforce quand les mentions existeront.
6. **Vocal** (`connect`, `speak`, `mute_members`, `move_members`) : à enforce quand le vocal sera côté serveur.

---

## 8. Migration / compatibilité

- Rôles existants : conserver tels quels ; si des valeurs hors vocabulaire traînent en base, les ignorer au calcul et les purger au prochain PATCH.
- Guilds existants : aucun changement de données — le socle par défaut reproduit le comportement actuel pour les membres simples, sauf la création de channels (volontaire, cf. §3.2).
- Le frontend gérait jusqu'ici l'UI au statut owner/non-owner : il est déjà passé au modèle par permissions, avec owner = toutes permissions. Aucune coordination de déploiement nécessaire pour P0 : le front tolère les `403` et masque déjà ce qui n'est pas permis.

## 9. Questions ouvertes (réponse nécessaire)

1. Socle par défaut **codé en dur** (notre hypothèse, §2) ou rôle **`@everyone` matérialisé** par guild ?
2. Convention de `position` : 0 = plus haut (notre hypothèse, §5) ?
3. Format d'erreur retenu (§3.4) : texte préfixé ou JSON ?
4. `GET /members/me` avec permissions calculées (§6.2) : retenu ou non ?

## 10. Récapitulatif des priorités

| Priorité | Item | Réf. |
|---|---|---|
| ⚠️ P0 | `PATCH /roles/<rid>` (le front l'appelle déjà) | §3.1 |
| ⚠️ P0 | Enforcement par permission (matrice) + validation vocabulaire | §3.2, §4 |
| ⚠️ P0 | Enforcement WS `send_messages`/`attach_files` | §3.3 |
| ⚠️ P0 | Format d'erreur stable `missing_permission` | §3.4 |
| P1 | Hiérarchie des rôles (anti-escalade) | §5 |
| P1 | Événements WS `role_created/modified/deleted` | §6.1 |
| P1 | `GET /members/me` + permissions calculées | §6.2 |
| P2 | Overrides par channel, ban, delete message, nicknames | §7 |
