# StateDB Explorer

A desktop GUI for browsing and visualizing the **Hermes** `state.db` — built with Electron, React, and native SQLite (`node:sqlite`).

Read local agent state directly on your machine: explore sessions and messages, inspect the database schema, and run read-only SQL — all in a clean, VS Code-styled dark interface.

## Features

- **Overview dashboard** — session / message / token statistics and recent activity at a glance
- **Session explorer** — browse conversations, grouped by turns with expandable tool-call chains, reasoning and raw message data
- **Schema browser** — inspect tables, columns, indexes and sample rows
- **SQL console** — run `SELECT` / `PRAGMA` / `WITH` queries (read-only) right from the UI
- **Auto-detection** — finds your `state.db` automatically across platforms, with a manual file picker as fallback
- **Live data** — reads via native SQLite (including un-checkpointed WAL data written by Hermes in real time)
- **Local & private** — every query runs in the Electron main process; nothing is uploaded
- **i18n** — English and Chinese (auto-detected from your system locale, switchable in Settings)

## Tech Stack

- [Electron](https://www.electronjs.org/) — main process + preload (context isolation, no `nodeIntegration`)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — renderer
- [Vite](https://vitejs.dev/) — build tooling
- [`node:sqlite`](https://nodejs.org/api/sqlite.html) — native SQLite in the main process

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron main process (electron/main.cjs)                   │
│  ├─ native SQLite (node:sqlite) loads local state.db         │
│  ├─ IPC: db:init / db:autoload / db:pick / db:query /        │
│  │       db:queryOne / db:exec / db:meta / db:reload         │
│  └─ creates the BrowserWindow                                │
└──────────────────────────────────────────────────────────────┘
                          ↕ contextBridge (preload.cjs)
┌──────────────────────────────────────────────────────────────┐
│  Renderer (React + Vite + TS)                                │
│  ├─ src/api.ts queries via window.stateDB (IPC)              │
│  └─ UI: Dashboard / Sessions / Schema / SQL / Settings       │
└──────────────────────────────────────────────────────────────┘
```

All database access lives in the **main process** and is surfaced to the renderer through a narrow IPC surface, so no Node capability is ever exposed to the UI layer.

## How to Run

### Development

```bash
npm install
npm run dev:renderer    # terminal 1: start Vite (port 5173)
npm run dev:electron    # terminal 2: start Electron (connects to Vite)
```

Or one shot — start both at once:

```bash
npm run dev             # concurrently runs Vite + Electron
```

### Production build

```bash
npm run build           # type-check + build the renderer to dist/
npm start               # run Electron against the built frontend
```

### Build a standalone executable

[electron-builder](https://www.electronjs.org/docs/latest/tutorial/electron-builder-cli) packages the app into a distributable executable for your current platform. Output goes to `release/`.

```bash
npm run dist            # build + package for the current platform (Windows: NSIS installer, macOS: dmg, Linux: AppImage)
npm run dist:dir        # build + produce an unpacked app directory only (fast, no installer)
npm run dist:win        # Windows installer
npm run dist:mac        # macOS dmg
npm run dist:linux      # Linux AppImage
```

The unpacked result is a runnable app (e.g. `release/win-unpacked/StateDB Explorer.exe` on Windows). Note: packaging for a platform other than the one you are building on generally requires that platform (or CI).

## Data Location

The main process auto-detects the Hermes home directory (where `state.db` lives) — the same logic as the Hermes source's `get_hermes_home()`:

- **Windows** — `%LOCALAPPDATA%\hermes\state.db` (fallback: `~/AppData/Local/hermes`)
- **macOS / Linux / POSIX** — `~/.hermes/state.db`
- **Override** — the `HERMES_HOME` environment variable always takes precedence

If no database is found, a file picker opens so you can select one manually.

## Screenshots

> Coming soon.

## License

[MIT](./LICENSE)
