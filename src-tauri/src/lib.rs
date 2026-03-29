mod backend;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::sync::atomic::AtomicUsize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tokio::sync::broadcast;

use backend::{
    midi::MidiManager,
    mdns,
    server::{run_server, ServerState},
    surfaces::{SurfaceManager, watch_surfaces},
    types::PortConfig,
};

// ── State shared with Tauri commands ──────────────────────────────────────────

struct SharedUrl(Mutex<String>);

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn open_in_browser(url: String) {
    open_url(&url);
}

#[tauri::command]
fn open_config_folder(app: tauri::AppHandle) {
    let config_dir = app_config_dir(&app);
    open_url(&config_dir.to_string_lossy());
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn open_url(target: &str) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(target).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", target]).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(target).spawn();
}

/// Returns (or creates) the user's MidiMaster config directory.
/// On macOS: ~/Library/Application Support/com.yagnilabs.midimaster/config
fn app_config_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_config_dir()
        .expect("Could not resolve app config dir");
    let config = base.join("config");
    std::fs::create_dir_all(config.join("surfaces")).ok();
    config
}

/// On first run, copy bundled default configs to the app config directory.
fn install_default_configs(app: &tauri::AppHandle) {
    let config_dir = app_config_dir(app);

    // Settings file
    let settings_dst = config_dir.join("settings.yaml");
    if !settings_dst.exists() {
        if let Ok(resource) = app.path().resolve("config/settings.yaml", tauri::path::BaseDirectory::Resource) {
            let _ = std::fs::copy(resource, &settings_dst);
        }
    }

    // Surface YAML files
    let surfaces_dir = config_dir.join("surfaces");
    if let Ok(resource_surfaces) = app.path().resolve("config/surfaces", tauri::path::BaseDirectory::Resource) {
        if let Ok(entries) = std::fs::read_dir(&resource_surfaces) {
            for entry in entries.flatten() {
                let dst = surfaces_dir.join(entry.file_name());
                if !dst.exists() {
                    let _ = std::fs::copy(entry.path(), dst);
                }
            }
        }
    }
}

// ── App entrypoint ────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Install default config files on first run
            install_default_configs(app.handle());

            let config_dir = app_config_dir(app.handle());

            // ── Load settings ────────────────────────────────────────────────
            let port_config = load_port_config(&config_dir.join("settings.yaml"));
            const PORT: u16 = 3000;

            // ── MIDI ─────────────────────────────────────────────────────────
            let mut midi = MidiManager::new();
            midi.connect(&port_config);
            println!("MIDI: {} (connected: {})", midi.port_name, midi.connected);

            let midi = Arc::new(Mutex::new(midi));

            // ── Surfaces ──────────────────────────────────────────────────────
            let surfaces_dir = config_dir.join("surfaces");
            let surfaces = Arc::new(RwLock::new(SurfaceManager::new(surfaces_dir.clone())));

            let (surfaces_tx, surfaces_rx) = broadcast::channel::<()>(4);
            watch_surfaces(surfaces_dir, Arc::clone(&surfaces), surfaces_tx);

            // ── HTTP + WS server ──────────────────────────────────────────────
            let (broadcast_tx, _) = broadcast::channel::<String>(64);
            let client_count = Arc::new(AtomicUsize::new(0));

            // Locate the web UI files to serve over HTTP for browser clients.
            // In prod: Tauri places frontendDist files in resource_dir() on macOS.
            // In dev:  dist/ is built by Vite at the project root (CWD).
            // In prod: Tauri places ../dist/** into resource_dir()/www/ via bundle.resources.
            // In dev:  fall back to dist/ in the project root (built by Vite / CWD).
            let static_dir = app.path().resource_dir()
                .ok()
                .map(|p| p.join("www"))
                .filter(|p| p.join("index.html").exists())
                .unwrap_or_else(|| {
                    std::env::current_dir()
                        .unwrap_or_default()
                        .join("dist")
                });

            let server_state = ServerState {
                midi: Arc::clone(&midi),
                surfaces: Arc::clone(&surfaces),
                broadcast_tx: broadcast_tx.clone(),
                client_count: Arc::clone(&client_count),
                port: PORT,
                static_dir,
            };

            // Start server on Tauri's Tokio runtime
            tauri::async_runtime::spawn(async move {
                run_server(server_state, surfaces_rx).await;
            });

            // mDNS advertising
            mdns::advertise(PORT);

            // Build share URL for tray use — always use mDNS name
            let share_url = format!("http://{}.local:{}", mdns::get_mdns_hostname(), PORT);
            app.manage(SharedUrl(Mutex::new(share_url.clone())));

            // ── System tray ───────────────────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let copy_item = MenuItem::with_id(app, "copy_link", "Copy Link", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit MidiMaster", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &copy_item, &sep, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => bring_to_front(app),
                    "copy_link" => {
                        let url = app
                            .state::<SharedUrl>()
                            .0
                            .lock()
                            .unwrap()
                            .clone();
                        use tauri_plugin_clipboard_manager::ClipboardExt;
                        let _ = app.clipboard().write_text(url);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        bring_to_front(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_in_browser, open_config_folder, quit_app])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MidiMaster");
}

fn bring_to_front(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn load_port_config(settings_path: &std::path::Path) -> PortConfig {
    let Ok(raw) = std::fs::read_to_string(settings_path) else {
        return PortConfig::Virtual;
    };
    let Ok(doc) = serde_yaml::from_str::<serde_yaml::Value>(&raw) else {
        return PortConfig::Virtual;
    };
    match &doc["midi"]["port"] {
        serde_yaml::Value::String(s) if s == "virtual" => PortConfig::Virtual,
        serde_yaml::Value::String(s) => PortConfig::Name(s.clone()),
        serde_yaml::Value::Number(n) => {
            PortConfig::Index(n.as_u64().unwrap_or(0) as usize)
        }
        _ => PortConfig::Virtual,
    }
}
