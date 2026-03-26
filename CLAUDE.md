# MidiMaster

Web-based MIDI controller. Backend runs on a laptop and sends MIDI to Ableton Live; frontend runs in any browser on the same network (phone, tablet, etc.).

## Commands

```bash
npm run dev        # run both backend and frontend concurrently (development)
npm run build      # build frontend into frontend/dist/
npm start          # run backend only (serves built frontend in production)
```

Backend only:
```bash
npm run dev -w backend       # tsx watch (auto-restarts on file change)
npm run typecheck -w backend
```

Frontend only:
```bash
npm run dev -w frontend      # vite --host (exposed on all network interfaces)
npm run typecheck -w frontend
```

## Architecture

**Monorepo** with two npm workspaces: `backend/` and `frontend/`.

### Backend (`backend/src/`)

Node.js + TypeScript, runs via `tsx` (no compile step).

| File | Purpose |
|------|---------|
| `index.ts` | Express server + WebSocket server at `/ws` |
| `midi-manager.ts` | MIDI output — virtual port, named port, or port index |
| `surface-manager.ts` | Loads `config/surfaces/*.yaml`, watches for hot-reload |
| `mdns.ts` | Advertises `midimaster-<hostname>.local` via `@homebridge/ciao` |
| `types.ts` | TypeScript interfaces for controls, surfaces, server info |

REST API:
- `GET /api/surfaces` — list of surface metadata
- `GET /api/surfaces/:id` — full surface config
- `GET /api/info` — mDNS hostname + local IP (port is NOT authoritative — frontend uses `window.location.port`)
- `GET /midi/ports` — available MIDI output ports

In production the backend also serves `frontend/dist/` as static files.

### Frontend (`frontend/src/`)

Vite + SolidJS + TypeScript. Hash-based routing (`/#/`, `/#/surface/:id`).

| File | Purpose |
|------|---------|
| `index.tsx` | App entry point |
| `App.tsx` | Root component: `HashRouter`, shell layout, header |
| `state.ts` | Global signal for `pageTitle` |
| `ws.ts` | Initialises `wsManager`, exposes SolidJS signals for WS status |
| `ws-manager.ts` | WS singleton with exponential-backoff reconnect (1s–8s) |
| `pages/Overview.tsx` | Surface list cards + share section (URLs, QR code) |
| `pages/Surface.tsx` | Control grid — renders `MidiButton`, `MidiSlider`, `MidiToggle` |

Dev proxy in `vite.config.ts` forwards `/api`, `/midi`, and `/ws` to `localhost:3000`.

### WebSocket protocol

Client → Server:
```json
{ "type": "note_on",  "note": 36, "velocity": 127, "channel": 10 }
{ "type": "note_off", "note": 36, "channel": 10 }
{ "type": "cc",       "cc": 74,   "value": 64,     "channel": 1  }
```

Server → Client:
```json
{ "type": "connected",        "midiPort": "MidiMaster (virtual)", "midiConnected": true }
{ "type": "surfaces_updated"  }
{ "type": "error",            "message": "..." }
```

## Configuration

### `backend/config/settings.yaml`

Global MIDI port. Options: `"virtual"` (creates a virtual port), port name (partial match, case-insensitive), or port index integer.

### `backend/config/surfaces/*.yaml`

One file = one control surface. Files are hot-reloaded — edit while the server is running and the UI updates automatically.

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
  value: 127        # optional, default 127
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

## Key technical notes

- **MIDI channel** is 1-indexed (1–16) in all config and protocol messages; the backend converts to 0-indexed for the `midi` package internally.
- **Share URLs** on the Overview page are constructed client-side using `window.location.port` so they reflect the actual port (5173 in dev, 3000 in prod), not the hardcoded backend port.
- **Copy to clipboard** uses `navigator.clipboard` with an `execCommand` fallback for HTTP (non-HTTPS) contexts on Android.
- **`midi` package** requires a native C++ build (node-gyp). On macOS: `xcode-select --install`. On Linux: `build-essential libasound2-dev`.
- **Types are duplicated** between `backend/src/types.ts` and `frontend/src/types.ts` — keep them in sync when adding control types.
