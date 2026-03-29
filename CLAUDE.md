# MidiMaster

Tauri V2 desktop app + web-based MIDI controller. The Rust backend runs inside the Tauri process and sends MIDI to Ableton Live (or any DAW). The web frontend runs in any browser on the same network (phone, tablet, etc.).

## Commands

```bash
# Desktop app (Tauri) — recommended for daily use
npm run tauri:dev      # start Tauri dev app (auto-starts Vite + opens window)
npm run tauri:build    # build distributable .app / installer

# Web frontend only (Vite dev server, no Tauri)
npm run dev            # vite --host on :5173 (for browser-only testing)
npm run build          # vite build → dist/
npm run typecheck      # tsc --noEmit

# Rust backend only
cd src-tauri && cargo check
cd src-tauri && cargo build
```

**Port note:** The Rust backend always binds to port 3000. If you change it, update `const PORT` in `src-tauri/src/lib.rs` AND `BACKEND_PORT` in `src/server-url.ts`.

## Architecture

### Desktop app (`src-tauri/`)

Rust + Tauri V2. The backend runs as part of the Tauri process — no Node.js required.

| File | Purpose |
|------|---------|
| `src/lib.rs` | Tauri setup: backend startup, system tray, Tauri commands |
| `src/main.rs` | Binary entry point |
| `src/backend/midi.rs` | MIDI output via `midir` — virtual port, named port, or index |
| `src/backend/surfaces.rs` | Loads `config/surfaces/*.yaml`, watches for hot-reload |
| `src/backend/mdns.rs` | Advertises `midimaster-<hostname>.local` via `mdns-sd` |
| `src/backend/server.rs` | Axum HTTP + WebSocket server on `:3000` |
| `src/backend/types.rs` | Shared Rust types (Control, SurfaceConfig, etc.) |
| `config/` | Default config files bundled as Tauri resources |
| `tauri.conf.json` | Tauri config: window, bundle, icons, resources |

**Tauri commands** (callable from the desktop window via `invoke()`):
- `open_in_browser(url)` — opens URL in default browser
- `open_config_folder()` — opens the user config dir in Finder
- `quit_app()` — exits the app

**System tray:** Show Window, Copy Link (uses clipboard-manager plugin), Quit

**Config directory (runtime):** `~/Library/Application Support/com.yagnilabs.midimaster/config/`
Default config files are copied here on first launch from the bundled resources.

REST API (served on `:3000`):
- `GET /api/surfaces` — list of surface metadata
- `GET /api/surfaces/:id` — full surface config
- `GET /api/info` — mDNS hostname + local IP + port
- `GET /midi/ports` — available MIDI output ports

Web UI static files: served from `resource_dir()` in production (Tauri bundles `dist/` there via `frontendDist`); served from `dist/` relative to CWD in dev.

### Frontend (`src/`)

Vite + SolidJS + TypeScript. Two separate Vite entry points:

| Entry | Purpose |
|-------|---------|
| `index.html` → `src/index.tsx` | Web UI for browser clients (phone/tablet) |
| `desktop.html` → `src/desktop.tsx` | Tauri desktop window UI |

| File | Purpose |
|------|---------|
| `App.tsx` | Hash router + shell layout + header |
| `state.ts` | Global `pageTitle` signal |
| `ws.ts` | Initialises `wsManager`, exposes SolidJS signals for WS status |
| `ws-manager.ts` | WS singleton using `partysocket` (exponential-backoff reconnect 1–8s) |
| `server-url.ts` | `API_BASE` and `wsUrl()` — handles dev vs Tauri-prod URL differences |
| `pages/Overview.tsx` | Surface list cards + share section (mDNS URL, QR code) |
| `pages/Surface.tsx` | Control grid — renders `MidiButton`, `MidiSlider`, `MidiToggle` |
| `pages/DesktopApp.tsx` | Desktop window: QR, URL, connected count, MIDI activity, quit |

**URL resolution:**
- In **Tauri dev**: window loads from `http://localhost:5173`, so `window.location.port = 5173`. WS is proxied by Vite. Relative `/api` fetches are proxied by Vite. Share URL uses port 5173.
- In **Tauri prod**: window loads from `tauri://localhost`. Relative URLs don't reach the Rust backend. `server-url.ts` detects this via `window.__TAURI_INTERNALS__` and uses absolute `http://localhost:3000` URLs. Share URL falls back to `BACKEND_PORT` (3000).
- In **browser**: all URLs are relative, `window.location.port` gives the right port.

Vite dev proxy (`vite.config.ts`) forwards `/api` and `/ws` to `localhost:3000`.

### WebSocket protocol

Client → Server:
```json
{ "type": "note_on",  "note": 36, "velocity": 127, "channel": 10 }
{ "type": "note_off", "note": 36, "channel": 10 }
{ "type": "cc",       "cc": 74,   "value": 64,     "channel": 1  }
```

Server → Client:
```json
{ "type": "connected",       "midiPort": "MidiMaster (virtual)", "midiConnected": true }
{ "type": "surfaces_updated" }
{ "type": "clients_updated", "count": 2 }
{ "type": "midi_activity" }
```

## Configuration

### `settings.yaml`

```yaml
midi:
  port: virtual       # "virtual" | port name (partial match) | port index integer
```

### `surfaces/*.yaml`

One file = one control surface. Files are hot-reloaded while the app is running.

Control types:

```yaml
# Momentary button — note_on on press, note_off on release
- type: button
  label: Kick
  note: 36          # or use cc: + value: for CC output
  velocity: 127     # optional, default 127
  channel: 10
  color: "#c0392b"
  span: 2           # grid column span (optional)
  rowSpan: 2        # grid row span (optional)

# Latching toggle — sends on-value on first press, 0/note_off on second
- type: toggle
  label: Loop
  cc: 64
  value: 127        # CC value when on (default 127)
  channel: 1
  color: "#7d3c98"
  default: false    # optional initial state

# CC slider
- type: slider
  label: Filter
  cc: 74
  channel: 1
  min: 0
  max: 127
  default: 64
  color: "#2471a3"
  span: 2
```

Surface-level layout:

```yaml
name: My Surface
color: "#c0392b"        # accent color for the overview card
layout:
  columns: 4            # grid columns (default 4)
  gap: 10               # gap in px (default 10)
controls:
  - ...
```

## Key technical notes

- **MIDI channel** is 1-indexed (1–16) in config and protocol; Rust converts to 0-indexed internally.
- **Share URL** uses mDNS hostname (`midimaster-<hostname>.local`) as primary. IP address is shown as secondary on the Overview page. QR code always encodes the mDNS URL.
- **Tauri prod vs dev URL detection** lives in `src/server-url.ts`. The check is `'__TAURI_INTERNALS__' in window && !import.meta.env.DEV`.
- **Web UI in production**: Tauri places `frontendDist` files in `resource_dir()` on macOS (`Contents/Resources/`). The Rust HTTP server checks for `index.html` there and falls back to `CWD/dist` in dev.
- **Config install**: on first run, default YAML files are copied from `src-tauri/config/` (bundled resources) to the user's app config directory. Subsequent launches read from the user config directory.
- **File watching**: surface YAML files are watched with a 150ms debounce. Changes broadcast `surfaces_updated` to all WS clients.
- **Single instance**: `tauri-plugin-single-instance` prevents launching a second copy; the existing window is focused instead.
