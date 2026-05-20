# Electron Hockey Booking App

This repository contains the **Electron** migration of the original Python booking application. The project is split into a **main process**, a **preload** layer, and a **renderer** built with React + TypeScript.

## Development Setup

```bash
# Install dependencies (only once)
npm install
```

### Start in Development Mode

```bash
# Build renderer (React) with Vite hot‑reload
npm run dev:renderer

# In a separate terminal build the main & preload (no hot‑reload)
npm run build:main

# Start Electron
npm start
```

The renderer will be served from `http://localhost:5173` (default Vite port). The main process will launch the Electron window and expose an IPC API.

## Build & Packaging

To create a distributable package you can use tools like `electron-builder` or `pkg`. The current setup only builds the main process; add a build script for packaging if needed.

## Folder Structure

```
Electron/
├─ package.json
├─ tsconfig.json
├─ electron.vite.config.ts  # Main Process build
├─ renderer.vite.config.ts  # Renderer build
├─ src/
│  ├─ main/                # Electron main process
│  │  ├─ index.ts
│  │  └─ services/
│  ├─ preload/             # Preload API
│  │  └─ index.ts
│  ├─ renderer/            # React UI
│  │  ├─ main.tsx
│  │  └─ components/
│  └─ shared/              # Types & IPC contract
│     ├─ types.ts
│     └─ ipc-contract.ts
└─ MIGRATION_PLAN.md
```

## Notes
- The original Python logic is ported incrementally. See `MIGRATION_PLAN.md` for the detailed steps.
- Logging is done via a shared Winston logger (`src/main/utils/logger.ts`).
- IPC contracts are defined in `shared/ipc-contract.ts`.
