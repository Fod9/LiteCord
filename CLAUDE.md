# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LiteCord is a lightweight, privacy-first Discord alternative built as a desktop app with Tauri (Rust shell) + React + TypeScript. The goal is to progressively clone Discord features against a custom backend documented in `API.md`.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (port 1420)
npx tauri dev        # Run full Tauri desktop app (recommended)

# Build
npm run build        # tsc + vite build
npx tauri build      # Package desktop binary

# Tests (Vitest — add before writing new features)
npm run test         # Run all tests
npm run test -- path/to/file.test.tsx   # Run single test file
npm run test -- --watch                 # Watch mode
```

# Tests Rust
cd src-tauri && cargo test

## Methodologies

**One Thing:** Each feature implementation focuses on one discrete user-facing capability at a time. No speculative features, no bundled unrelated changes.

**TDD for API-dependent or complex logic:**
1. Write failing test(s) first
2. Implement the feature
3. Run tests — iterate until green
4. Refactor if needed

## Architecture

### App Shell

```
App.tsx
├── ServerSideBar        (left column — server/home icons)
├── AdaptableSideBar     (middle column — toggles via `mode` prop)
│   ├── mode="pm"    → PrivateMessageSideBar
│   └── mode="channels" → ChannelsSideBar
└── <Outlet />           (right column — route content)
```

Routes are declared in `App.tsx` using React Router v7. Current routes: `/` → `FriendPage`.

### Component Organization

- `src/components/globals/` — persistent UI (sidebars, layout chrome)
- `src/components/friends/` — friend-list feature components
- `src/routes/` — page-level route components
- `src/styles/` — feature-scoped CSS files (no CSS modules, plain `.css` imports)
- `src/utils/` — thin wrappers (e.g. `windows-helper.tsx` for Tauri window API)

### State Management

Currently local `useState` only — no global store. When shared state is needed across routes/sidebars, prefer React Context before reaching for a heavier solution.

### Tauri Integration — Rust First

**The cardinal rule: Rust handles all I/O, React is pure UI.**

- Every API call goes through a `#[tauri::command]` in Rust (`src-tauri/src/`) — never use `fetch()` in TypeScript
- Token storage, file access, WebSocket connections, and any stateful I/O belong in Rust
- The frontend calls `invoke("command_name", args)` from `@tauri-apps/api/core` and receives only the data it needs to render (e.g. a `User` struct, never a raw token)
- `AppState` (registered via `app.manage()`) holds the shared `reqwest::Client`, token store path, and API base URL

**Adding a new backend feature:**
1. Write the `#[tauri::command]` in the appropriate `src-tauri/src/<domain>.rs` module
2. Register it in the `tauri::generate_handler![]` macro in `lib.rs`
3. Add a thin `invoke()` wrapper in `src/services/<domain>.ts`
4. Write tests mocking `@tauri-apps/api/core` — never mock `fetch`

**Current Rust modules:**
- `src-tauri/src/auth.rs` — login, signup, get_current_user, logout
- `src-tauri/src/store.rs` — file-based token storage (`{app_data_dir}/tokens.json`)

**API URL:** controlled by `LITECORD_API_URL` env var at runtime (default `http://localhost:8000`), set in Rust `setup()`.

Desktop app config: `src-tauri/tauri.conf.json`

## API Integration

The backend is fully documented in `API.md`. Key conventions:

- **Auth:** All 🔒 routes require `Authorization: Bearer <token>` — Rust attaches this automatically from the stored token; the TS layer never handles tokens
- **Token refresh:** Server sends `{ type: "refresh_token" }` over WebSocket every ~300s — will be handled in Rust WebSocket manager
- **IDs:** SurrealDB format — e.g. `user:abc123`, `friendship:xyz789`. Treat as opaque strings.
- **WebSocket:** Connect to `/ws`, first message must be `{ type: "auth", token }` — to be implemented in Rust
- **Errors:** API returns plain-text body on failure — Rust commands surface this as `Err(String)`, which `invoke()` rejects as a JS `Error`

## Styling Conventions

- Dark theme baseline: background `#323339`, secondary `#2f3136`, accent `#8257e6`
- Font: JetBrains Mono
- Feature-specific CSS lives in `src/styles/<feature>.css` and is imported where needed
- No CSS framework — plain CSS with hover/active states using alpha transparency

## Current State & What's Missing

- Auth fully implemented (Rust + React): login, signup, session restore, logout
- Sidebar UI scaffolding done with fake/hardcoded data — not yet wired to API
- No ESLint/Prettier configured
- `ChannelsSideBar` is a stub
- WebSocket not yet implemented (needed for real-time messaging)
