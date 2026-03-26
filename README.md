# MidiMaster

Web-based MIDI controller. Run on a laptop, control Ableton Live from any device on the same network (phone, tablet, etc.) via a browser.

## How it works

- **Backend** (Node.js + TypeScript): serves the UI, accepts WebSocket connections, sends MIDI messages via a virtual port or real MIDI port.
- **Frontend** (Vite + TypeScript, vanilla): overview page lists all control surfaces, each surface has its own sharable URL. Mobile-optimized.
- **mDNS**: backend advertises itself as `midimaster-<hostname>.local` so it's discoverable on the network.

## Prerequisites

Node.js 18+ and the native build toolchain for the `midi` package:

```bash
# macOS
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt install build-essential libasound2-dev
```

## Installation

```bash
npm install
```

## Running (development)

```bash
npm run dev
```

- Backend API: `http://localhost:3000`
- Frontend dev server: `http://localhost:5173`

Open the frontend URL in your browser. From mobile, use the laptop's LAN IP shown in the terminal.

## Running (production)

```bash
npm run build   # builds frontend into frontend/dist/
npm start       # backend serves the built frontend on port 3000
```

Then open `http://midimaster-<hostname>.local:3000` or the IP shown in the terminal from any device on the network.

## MIDI Setup (macOS)

By default, MidiMaster opens a **virtual MIDI port** named `MidiMaster`. To receive it in Ableton:

1. Open **Audio MIDI Setup** (`/Applications/Utilities/Audio MIDI Setup.app`) → MIDI Studio (⌘+2).
2. Enable the **IAC Driver** (optional, only needed for existing port routing).
3. In Ableton → **Preferences → MIDI**:
   - Enable **MidiMaster** as an Input with **Remote** and/or **Track** on.

Alternatively, set `midi.port` in `config/settings.yaml` to an existing port name.

## Configuration

### Global settings — `backend/config/settings.yaml`

```yaml
midi:
  port: virtual   # "virtual", port name (e.g. "IAC Driver Bus 1"), or index
```

### Control surfaces — `backend/config/surfaces/*.yaml`

Each file = one control surface, accessible at `/#/surface/<filename>`.
**Edit files while the server is running — the UI updates automatically.**

```yaml
name: My Surface
description: Optional subtitle shown on overview
color: "#2471a3"        # accent color for overview card

layout:
  columns: 4            # grid columns
  gap: 10               # gap in px

controls:
  # Note button
  - type: button
    label: Kick
    note: 36             # MIDI note number
    velocity: 127        # optional, default 127
    channel: 10          # MIDI channel (1–16)
    color: "#c0392b"
    span: 1              # grid column span (optional)
    rowSpan: 2           # grid row span (optional)

  # CC button (momentary: sends value on press, 0 on release)
  - type: button
    label: Loop
    cc: 64
    value: 127
    channel: 1
    color: "#7d3c98"

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

### Control types

| Type | Fields | Behavior |
|------|--------|----------|
| `button` + `note` | `note`, `velocity`, `channel` | note_on on press, note_off on release |
| `button` + `cc` | `cc`, `value`, `channel` | CC=value on press, CC=0 on release |
| `slider` | `cc`, `min`, `max`, `default`, `channel` | CC sent continuously while dragging |

## Project structure

```
midimaster/
├── package.json                     # workspace root
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── config/
│   │   ├── settings.yaml            # global MIDI port
│   │   └── surfaces/
│   │       ├── drums.yaml           # ← add/edit surfaces here
│   │       └── mixer.yaml
│   └── src/
│       ├── index.ts                 # Express + WebSocket server
│       ├── midi-manager.ts          # MIDI output
│       ├── surface-manager.ts       # loads & watches surfaces dir
│       ├── mdns.ts                  # mDNS advertisement
│       └── types.ts
└── frontend/
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.ts                  # app shell + routing
        ├── router.ts                # hash-based router
        ├── ws-manager.ts            # WebSocket singleton
        ├── types.ts
        ├── style.css
        └── pages/
            ├── overview.ts          # surface list + share UI
            └── surface.ts           # control grid renderer
```
