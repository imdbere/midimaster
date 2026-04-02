# MidiMaster

A desktop app that turns your phone or tablet into a wireless MIDI controller.

Run it on your laptop, share the link with any device on your network, and control Ableton Live (or any DAW that accepts MIDI) from a mobile browser — no app install required.

## Features

- **Wireless MIDI** — send notes and CC messages over your local network
- **Any browser** — works on iPhone, Android, iPad, or any device with a browser
- **Easy sharing** — scan the QR code or copy the link from the desktop window
- **YAML config** — define custom control surfaces (pads, sliders, toggles) in plain text
- **Hot reload** — edit surface files while the app is running; the UI updates instantly
- **System tray** — runs quietly in the background; shows QR and live status

## Getting Started

### Requirements

- macOS, Windows, or Linux
- Rust + Cargo (`rustup.rs`)
- Node.js + npm
- **Linux only:** install these system libraries before building:
  ```bash
  sudo apt install libgtk-3-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev libasound2-dev
  ```
- **Windows only:** [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) must be installed

Windows does not support virtual MIDI ports natively. MidiMaster uses the teVirtualMIDI driver (bundled with loopMIDI) to create a virtual port named **MidiMaster** at startup. Install loopMIDI once — you don't need to create any ports in it, just install it so the driver is present. The port will appear in Ableton's MIDI preferences (and any other DAW) automatically when MidiMaster is running.

BUG: Due to an issue with Windows new MIDI driver that is currently being rolled out, virtual midi devices will sometimes not appear after being created. To fix this, restart "Windows MIDI Service" using the Services panel AFTER starting midimaster. More info:
- https://forums.steinberg.net/t/loop-midi-hidden-in-windows-11-25h2-fix/1024008 
- https://devblogs.microsoft.com/windows-music-dev/windows-midi-services-rollout-known-issues-and-workarounds/ 
- https://github.com/microsoft/MIDI/issues/835

### Run in development

```bash
npm install
npm run tauri:dev
```

This starts the Vite dev server and opens the MidiMaster desktop window. The backend (MIDI, mDNS, HTTP/WS server) starts automatically.

### Build a distributable app

```bash
npm run tauri:build
```

The `.app` bundle (macOS) is output to `src-tauri/target/release/bundle/`.

## Connecting a device

1. Launch MidiMaster — the desktop window shows a QR code and URL
2. Make sure your phone/tablet is on the same Wi-Fi network
3. Scan the QR code or type the URL into a browser
4. Open a surface from the list and start playing

The URL uses the mDNS hostname (`midimaster-<computername>.local`) which resolves automatically on macOS, iOS, and most Android/Linux devices.

## Configuration

Config files live at:

```
# macOS
~/Library/Application Support/com.yagnilabs.midimaster/config/

# Windows
%APPDATA%\com.yagnilabs.midimaster\config\
```

```
config/
  settings.yaml        ← MIDI port selection
  surfaces/
    drums.yaml         ← your surfaces
    mixer.yaml
    ...
```

Default files are installed automatically on first launch. Open the config folder from the desktop app (Config button) or from the system tray.

### MIDI port (`settings.yaml`)

```yaml
midi:
  port: virtual        # create a virtual port (route it in DAW)
  # port: "Ableton"    # partial name match, case-insensitive
  # port: 0            # port index
```

### Control surfaces (`surfaces/*.yaml`)

Each YAML file defines one surface — a grid of buttons, sliders, and toggles.

```yaml
name: Drum Pads
description: 8-pad drum machine
color: "#c0392b"

layout:
  columns: 4
  gap: 10

controls:
  - type: button
    label: Kick
    note: 36
    velocity: 127
    channel: 10
    color: "#c0392b"
    span: 2      # spans 2 columns
    rowSpan: 2   # spans 2 rows

  - type: toggle
    label: Loop
    cc: 64
    value: 127
    channel: 1
    color: "#7d3c98"

  - type: slider
    label: Filter
    cc: 74
    channel: 1
    min: 0
    max: 127
    default: 64
    color: "#2471a3"
```

**Buttons** send `note_on` on press and `note_off` on release (or CC if `cc:` is used instead of `note:`).
**Toggles** latch on/off — first press sends the on-value, second press sends 0.
**Sliders** send continuous CC messages as you drag.

MIDI channels are 1-indexed (1–16).

## Architecture

MidiMaster is a [Tauri V2](https://tauri.app) desktop app:

- **Rust backend** (inside the Tauri process): Axum HTTP server, WebSocket server, MIDI output via `midir`, mDNS via `mdns-sd`, YAML config with file watching
- **Web frontend** (SolidJS + Vite): two bundles — the desktop window UI and the mobile browser controller UI
- **No Node.js at runtime** — everything is compiled into a single native binary

The Rust HTTP server runs on port 3000 and serves both the REST API and the mobile browser web UI. The Tauri desktop window is served separately via Tauri's internal webview protocol.
