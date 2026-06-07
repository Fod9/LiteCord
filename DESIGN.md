# LiteCord — Charte graphique

> Document de référence pour toute la refonte visuelle. Toute décision de style doit respecter ce guide.

---

## Direction artistique

**Moderne & coloré** — Interface sombre à base bleue-nuit avec des accents indigo vibrants. La modernité vient des espacements généreux, de la typographie soignée et des dégradés ciblés sur les éléments interactifs. Pas de skeuomorphisme, pas d'ombres lourdes : minimalisme assumé avec de la couleur.

---

## Palette de couleurs

### Arrière-plans (du plus sombre au plus clair)

| Token              | Valeur      | Usage                                      |
|--------------------|-------------|--------------------------------------------|
| `--bg-base`        | `#0d0d14`   | Fond le plus profond (body, server sidebar)|
| `--bg-sidebar`     | `#0f0f1a`   | Sidebar PM / channels                      |
| `--bg-main`        | `#13131f`   | Zone de contenu principale                 |
| `--bg-surface`     | `#1a1b2e`   | Cards, modals, éléments surélevés          |
| `--bg-elevated`    | `#1e2035`   | Hover sur surfaces, inputs au repos        |
| `--bg-input`       | `#22243a`   | Champs de saisie                           |

### Texte

| Token                | Valeur      | Usage                                  |
|----------------------|-------------|----------------------------------------|
| `--text-primary`     | `#f1f1f5`   | Texte principal, noms, contenus        |
| `--text-secondary`   | `#9b9bb8`   | Labels, métadonnées, placeholders      |
| `--text-muted`       | `#55566e`   | Timestamps, textes désactivés          |

### Accent (Indigo → Violet)

| Token                | Valeur                                          | Usage                          |
|----------------------|-------------------------------------------------|--------------------------------|
| `--accent`           | `#6366f1`                                       | Couleur d'accent de référence  |
| `--accent-light`     | `#818cf8`                                       | Hover, états actifs            |
| `--accent-dark`      | `#4f46e5`                                       | Pressed, focus ring            |
| `--accent-subtle`    | `rgba(99, 102, 241, 0.12)`                      | Sélection, fond badge          |
| `--accent-gradient`  | `linear-gradient(135deg, #6366f1, #8b5cf6)`     | Boutons primaires, badges      |

### Couleurs de statut

| Token           | Valeur      | Usage                        |
|-----------------|-------------|------------------------------|
| `--success`     | `#34d399`   | Confirmation, ami accepté    |
| `--danger`      | `#f87171`   | Suppression, erreur          |
| `--warning`     | `#fbbf24`   | Avertissement                |
| `--danger-subtle` | `rgba(248, 113, 113, 0.12)` | Fond hover bouton danger |

### Bordures

| Token              | Valeur                        | Usage                         |
|--------------------|-------------------------------|-------------------------------|
| `--border-subtle`  | `rgba(255, 255, 255, 0.05)`   | Séparateurs très discrets     |
| `--border-default` | `rgba(255, 255, 255, 0.09)`   | Bordures de cards, headers    |
| `--border-strong`  | `rgba(255, 255, 255, 0.15)`   | Focus, éléments en avant-plan |

---

## Typographie

### Police : Geist (Vercel)

Chargée via CDN Vercel dans `index.html` :

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- **UI / Interface** → `Geist, sans-serif`
- **Messages / Code** → `Geist Mono, monospace`

### Échelle typographique

| Token            | Taille | Poids | Usage                                  |
|------------------|--------|-------|----------------------------------------|
| `--text-xs`      | 11px   | 500   | Timestamps, badges de comptage         |
| `--text-sm`      | 13px   | 400   | Labels, hints, métadonnées             |
| `--text-base`    | 15px   | 400   | Corps de texte, messages               |
| `--text-md`      | 15px   | 600   | Noms dans les listes, titres de section|
| `--text-lg`      | 17px   | 600   | Titres de page, header de DM           |
| `--text-xl`      | 22px   | 700   | Titres de cards (auth, modals)         |

---

## Espacements

Base : **4px**

```
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48
```

| Usage courant              | Valeur |
|----------------------------|--------|
| Gap interne d'un row       | 12px   |
| Padding horizontal sidebar | 12px   |
| Padding d'une entry        | 12px 16px |
| Padding zone de contenu    | 24px   |
| Gap entre messages         | 16px   |
| Padding input bar          | 12px 16px 20px |

---

## Border-radius

| Token          | Valeur | Usage                              |
|----------------|--------|------------------------------------|
| `--radius-sm`  | 6px    | Badges, petits boutons icône       |
| `--radius-md`  | 8px    | Boutons, inputs, entries           |
| `--radius-lg`  | 12px   | Cards, sidebars internes           |
| `--radius-xl`  | 14px   | Modals, overlays                   |
| `--radius-full`| 9999px | Avatars, status dots               |

---

## Ombres

| Token             | Valeur                                           | Usage                  |
|-------------------|--------------------------------------------------|------------------------|
| `--shadow-sm`     | `0 1px 3px rgba(0,0,0,0.4)`                     | Cards légères          |
| `--shadow-md`     | `0 4px 16px rgba(0,0,0,0.5)`                    | Modals, dropdowns      |
| `--shadow-accent` | `0 0 0 2px var(--accent-dark)`                  | Focus ring             |

---

## Dégradés

Les dégradés sont **réservés aux éléments interactifs primaires** : boutons, badges d'accent. Les fonds restent unis.

```css
/* Bouton primaire */
background: var(--accent-gradient);
/* = linear-gradient(135deg, #6366f1, #8b5cf6) */

/* Hover bouton primaire */
background: linear-gradient(135deg, #818cf8, #a78bfa);

/* Pas de dégradé sur les fonds de sidebar ou de contenu */
```

---

## Composants — Règles visuelles

### Sidebar (PM / Channels)

- Largeur : `280px`
- Fond : `var(--bg-sidebar)` = `#0f0f1a`
- Bordure droite : `1px solid var(--border-subtle)`
- Header ("Messages privés") : `padding: 16px`, `font-size: var(--text-sm)`, `font-weight: 600`, `color: var(--text-secondary)`, `text-transform: uppercase`, `letter-spacing: 0.06em`

### Entry (DM entry, friend row)

- Hauteur : `~52px`
- Padding : `12px 16px`
- Border-radius : `var(--radius-md)` = `8px`
- Avatar : `38px × 38px`, `border-radius: var(--radius-full)`
- Nom : `var(--text-md)`, `color: var(--text-secondary)` au repos
- Hover : `background: var(--bg-elevated)`, nom passe à `var(--text-primary)`
- Sélectionné : `background: var(--accent-subtle)`, nom `var(--text-primary)`, accent color left-border `3px solid var(--accent)`

### Bouton primaire

```css
background: var(--accent-gradient);
color: white;
border: none;
border-radius: var(--radius-md);
padding: 10px 20px;
font-family: 'Geist', sans-serif;
font-size: var(--text-base);
font-weight: 600;
cursor: pointer;
transition: opacity 0.15s, transform 0.1s;

&:hover { opacity: 0.88; }
&:active { transform: scale(0.98); }
&:disabled { opacity: 0.4; cursor: not-allowed; }
```

### Bouton danger

```css
background: transparent;
color: var(--danger);
border: 1px solid transparent;
border-radius: var(--radius-sm);

&:hover {
  background: var(--danger-subtle);
  border-color: rgba(248, 113, 113, 0.2);
}
```

### Input / Champ de saisie

```css
background: var(--bg-input);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-md);
color: var(--text-primary);
font-family: 'Geist', sans-serif;
font-size: var(--text-base);
padding: 10px 14px;
transition: border-color 0.15s;

&::placeholder { color: var(--text-muted); }
&:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: var(--shadow-accent);
}
```

### Message DM

- Container : `display: flex; gap: 8px; align-items: flex-start; padding: 8px 0`
- Avatar auteur : `32px`, `border-radius: var(--radius-full)`
- Nom auteur : `var(--text-sm)`, `font-weight: 600`, `color: var(--accent-light)`
- Contenu : `var(--text-base)`, `color: var(--text-primary)`, `line-height: 1.5`, `font-family: 'Geist Mono', monospace`
- Timestamp : `var(--text-xs)`, `color: var(--text-muted)`

### Modal

```css
background: var(--bg-surface);
border: 1px solid var(--border-default);
border-radius: var(--radius-xl);
box-shadow: var(--shadow-md);
max-width: 460px;
```

Backdrop : `rgba(0, 0, 0, 0.7)`

### Badge de comptage (ex: demandes en attente)

```css
background: var(--danger);
color: white;
border-radius: var(--radius-full);
font-size: 10px;
font-weight: 700;
min-width: 18px;
height: 18px;
padding: 0 5px;
```

---

## Variables CSS à déclarer dans `global.css`

```css
:root {
  /* Backgrounds */
  --bg-base:     #0d0d14;
  --bg-sidebar:  #0f0f1a;
  --bg-main:     #13131f;
  --bg-surface:  #1a1b2e;
  --bg-elevated: #1e2035;
  --bg-input:    #22243a;

  /* Text */
  --text-primary:   #f1f1f5;
  --text-secondary: #9b9bb8;
  --text-muted:     #55566e;

  /* Accent */
  --accent:          #6366f1;
  --accent-light:    #818cf8;
  --accent-dark:     #4f46e5;
  --accent-subtle:   rgba(99, 102, 241, 0.12);
  --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);

  /* Status */
  --success:       #34d399;
  --danger:        #f87171;
  --warning:       #fbbf24;
  --danger-subtle: rgba(248, 113, 113, 0.12);

  /* Borders */
  --border-subtle:  rgba(255, 255, 255, 0.05);
  --border-default: rgba(255, 255, 255, 0.09);
  --border-strong:  rgba(255, 255, 255, 0.15);

  /* Radius */
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   14px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:     0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md:     0 4px 16px rgba(0, 0, 0, 0.5);
  --shadow-accent: 0 0 0 2px var(--accent-dark);

  /* Typography */
  --font-ui:   'Geist', sans-serif;
  --font-mono: 'Geist Mono', monospace;

  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 15px;
  --text-lg:   17px;
  --text-xl:   22px;
}
```

---

## Ordre d'implémentation suggéré

1. `index.html` — charger Geist
2. `global.css` — injecter les custom properties, remplacer body font
3. `friend-sidebar.css` — sidebar PM + entries
4. `friends.css` — friend list, header tabs, search bar
5. `dm.css` — page DM, messages, input bar
6. `create-dm-modal.css` — modal
7. `auth.css` — login/signup
