# Demande backend — Channels vocaux & Permissions fines par channel

**De :** équipe frontend LiteCord
**Objet :** support backend pour (1) les channels vocaux temps réel et (2) les overrides de permissions par channel
**État côté frontend :** infrastructure WebRTC (signaling P2P) déjà en place — seul le tracking de présence et les endpoints de permissions manquent.

---

## 1. Channels vocaux — présence temps réel

### 1.1 Nouveaux messages WebSocket (client → serveur)

#### Rejoindre un channel vocal
```json
{ "message_type": "voice_join", "channel_id": "channel:<id>" }
```
Enregistre l'utilisateur dans le channel vocal. S'il était déjà dans un autre channel vocal du même guild, il en est retiré automatiquement.

**Validation :**
- `channel_id` doit être un channel `Voice` dans un guild dont l'utilisateur est membre
- Requiert la permission `connect` (incluse dans le socle par défaut)
- Erreur si permission manquante : `{ "message_type": "error", "content": "missing_permission:connect" }`

#### Quitter le channel vocal
```json
{ "message_type": "voice_leave" }
```
Retire l'utilisateur de son channel vocal actuel. No-op s'il n'est dans aucun channel.

---

### 1.2 Événement WS (serveur → tous les membres du guild)

**`voice_state_update`** — diffusé à tous les membres du guild dès qu'un utilisateur rejoint ou quitte un channel vocal.

```json
{
  "message_type": "voice_state_update",
  "content": "{\"user\":{\"id\":\"user:<id>\",\"name\":\"alice\",\"display_name\":\"Alice\",\"profile_picture\":\"\"},\"guild_id\":\"guild:<id>\",\"channel_id\":\"channel:<id>\"}"
}
```

Sémantique du champ `content` (JSON stringifié, même convention que les autres événements) :

| Champ | Type | Description |
|---|---|---|
| `user` | `ChatUser` | Infos de l'utilisateur (id, name, display_name, profile_picture) |
| `guild_id` | `string` | ID du guild concerné |
| `channel_id` | `string \| null` | ID du channel rejoint, `null` si l'utilisateur a quitté le vocal |

**Déclenchement :**
- Quand l'utilisateur rejoint un channel (`voice_join`) : `channel_id` = le channel
- Quand l'utilisateur quitte (`voice_leave`) : `channel_id` = `null`
- Quand l'utilisateur se déconnecte du WS : `channel_id` = `null` (cleanup automatique)
- Quand l'utilisateur est kické ou quitte le guild : `channel_id` = `null`

---

### 1.3 État initial — qui est dans quel channel

Quand un utilisateur se connecte/reconnecte au WS ou charge un guild, il a besoin de l'état courant de la présence vocale.

**Option A (recommandée) — champ `voice_states` dans la réponse WS `authenticated` :**
```json
{
  "status": "authenticated",
  "friends_online": ["user:abc"],
  "voice_states": [
    { "user": {...}, "guild_id": "guild:1", "channel_id": "channel:5" },
    { "user": {...}, "guild_id": "guild:1", "channel_id": "channel:5" }
  ]
}
```

**Option B — endpoint HTTP dédié :**
```
GET /guilds/<guild_id>/voice  🔒
```
Retourne la liste des `VoiceState` actifs pour ce guild.

```json
[
  { "user": { "id": "...", "name": "...", "display_name": "...", "profile_picture": "" }, "guild_id": "guild:1", "channel_id": "channel:5" }
]
```

Le frontend appelle cet endpoint au chargement d'un guild et écoute les événements WS pour se maintenir à jour.

**Notre préférence : Option A** (évite un round-trip HTTP supplémentaire). Mais si c'est plus simple côté implémentation, Option B est aussi acceptable.

---

### 1.4 Résumé des contrats vocaux

| Type | Contrat |
|---|---|
| Client → Serveur (WS) | `{ "message_type": "voice_join", "channel_id": "..." }` |
| Client → Serveur (WS) | `{ "message_type": "voice_leave" }` |
| Serveur → tous membres (WS) | `{ "message_type": "voice_state_update", "content": "..." }` |
| Serveur → tous membres (WS) | `voice_states` dans `authenticated` OU `GET /guilds/<gid>/voice` |

Le frontend **n'a pas besoin** d'un serveur TURN/STUN dédié ni de SFU — les connexions audio sont WebRTC peer-to-peer directes, le serveur ne fait que broadcaster la présence. Les signaux SDP/ICE continuent de passer par le mécanisme `relay` existant.

---

## 2. Overrides de permissions par channel

### 2.1 Modèle de données

Champ `permission_overwrites` ajouté à l'objet `GuildChannel` :

```json
{
  "id": "channel:abc",
  "guild": "guild:1",
  "name": "secret",
  "channel_type": "Text",
  "category": null,
  "created_at": "...",
  "permission_overwrites": [
    { "target": "role:<id>",  "allow": ["view_channels", "send_messages"], "deny": [] },
    { "target": "user:<id>",  "allow": [], "deny": ["view_channels"] }
  ]
}
```

`permission_overwrites` est optionnel (défaut `[]`). Le format est rétrocompatible — les clients qui ignorent ce champ continuent de fonctionner.

**Résolution (ordre de priorité croissante) :**
1. Socle + rôles (permission effectives globales)
2. Deny des rôles (si un rôle a `deny: ["send_messages"]`)
3. Allow des rôles
4. Deny de l'utilisateur spécifique
5. Allow de l'utilisateur spécifique
6. `administrator` contourne toujours tout

---

### 2.2 Endpoint de mise à jour

```
PUT /guilds/<guild_id>/channels/<channel_id>/permissions  🔒
```

**Corps** — remplace la liste entière des overwrites :
```json
{
  "permission_overwrites": [
    { "target": "role:<id>", "allow": ["view_channels"], "deny": [] },
    { "target": "user:<id>", "allow": [], "deny": ["view_channels"] }
  ]
}
```

**Retour** `200` — l'objet `GuildChannel` mis à jour (avec `permission_overwrites` peuplé).

**Erreurs :**
- `403` — `missing_permission:manage_channels`
- `400` — permission inconnue dans `allow` ou `deny`
- `404` — channel introuvable

**Événement WS** diffusé à tous les membres du guild :
```json
{ "message_type": "channel_permissions_updated", "content": "{ ...GuildChannel complet }" }
```

---

### 2.3 Filtrage `GET /guilds/<gid>/channels`

Une fois les overwrites implémentés, la route doit :
- Exclure les channels sur lesquels l'utilisateur a `deny: view_channels` sans avoir `allow: view_channels` ou `administrator`
- Conséquences : le nombre de channels visible peut varier par membre

⚠️ Cette exigence peut être implémentée dans un second temps — le front tolère de recevoir des channels auxquels il ne peut pas accéder (il affiche un message d'erreur à l'ouverture).

---

## 3. Questions ouvertes — ✅ Répondues

1. **Option A retenue** — `voice_states` inclus dans la réponse WS `authenticated`. Le frontend lit ce tableau au démarrage et initialise sa carte de présence vocale sans round-trip HTTP supplémentaire.
2. **Cleanup immédiat** — un `voice_leave` automatique est déclenché dès la déconnexion WS, sans délai. Convient parfaitement au cas d'usage LiteCord (pas de reconnexion transparente en cours de session).
3. **Livraison en une seule phase** — le champ `permission_overwrites` sur `GuildChannel`, l'endpoint `PUT .../permissions`, et le filtrage `GET /channels` sont tous livrés ensemble. API.md est à jour.

> ⚠️ **Point d'attention — relay WS et amitiés :** le mécanisme `relay` utilisé pour le signaling WebRTC (SDP/ICE) requiert une amitié `accepted` entre les deux utilisateurs. Dans un guild, des membres peuvent ne pas être amis → les canaux vocaux de guild ne fonctionneront pas pour eux. À discuter avec le backend pour étendre le relay aux membres d'un même guild ou créer un mécanisme de signaling alternatif.

---

## 4. Priorités

| Priorité | Item |
|---|---|
| P0 | `voice_join` / `voice_leave` WS + `voice_state_update` broadcast |
| P0 | État initial vocal (Option A dans `authenticated`, ou Option B `GET /voice`) |
| P1 | `permission_overwrites` sur GuildChannel + `PUT /channels/<id>/permissions` |
| P1 | `channel_permissions_updated` WS event |
| P2 | Filtrage `GET /channels` par overwrites |
