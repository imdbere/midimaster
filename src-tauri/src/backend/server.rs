use std::sync::{Arc, Mutex, RwLock};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::path::PathBuf;
use std::net::SocketAddr;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tower_http::{cors::CorsLayer, services::ServeDir};
use serde_json::{json, Value};

use super::{
    midi::MidiManager,
    mdns::{get_local_ip, get_mdns_hostname},
    surfaces::SurfaceManager,
};

#[derive(Clone)]
pub struct ServerState {
    pub midi: Arc<Mutex<MidiManager>>,
    pub surfaces: Arc<RwLock<SurfaceManager>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub client_count: Arc<AtomicUsize>,
    pub port: u16,
    pub static_dir: PathBuf,
}

pub async fn run_server(state: ServerState, mut surfaces_changed_rx: broadcast::Receiver<()>) {
    let port = state.port;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    // Forward surface-change events into WS broadcasts
    {
        let tx = state.broadcast_tx.clone();
        tokio::spawn(async move {
            while surfaces_changed_rx.recv().await.is_ok() {
                let _ = tx.send(json!({ "type": "surfaces_updated" }).to_string());
            }
        });
    }

    let app = Router::new()
        .route("/api/surfaces", get(get_surfaces))
        .route("/api/surfaces/{id}", get(get_surface))
        .route("/api/info", get(get_info))
        .route("/midi/ports", get(get_midi_ports))
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new(&state.static_dir))
        .layer(CorsLayer::permissive())
        .with_state(state);

    println!("MidiMaster server on http://0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind server");
    axum::serve(listener, app).await.expect("Server error");
}

async fn get_surfaces(State(s): State<ServerState>) -> Json<Value> {
    let surfaces = s.surfaces.read().unwrap();
    Json(json!(surfaces.get_meta()))
}

async fn get_surface(Path(id): Path<String>, State(s): State<ServerState>) -> Response {
    let surfaces = s.surfaces.read().unwrap();
    match surfaces.get(&id) {
        Some(surface) => Json(json!(surface)).into_response(),
        None => (StatusCode::NOT_FOUND, Json(json!({ "error": "Surface not found" }))).into_response(),
    }
}

async fn get_info(State(s): State<ServerState>) -> Json<Value> {
    let hostname = get_mdns_hostname();
    let ip = get_local_ip();
    Json(json!({
        "mdnsHostname": format!("{hostname}.local"),
        "mdnsUrl": format!("http://{hostname}.local:{}", s.port),
        "localIp": ip,
        "localUrl": ip.map(|i| format!("http://{}:{}", i, s.port)),
        "port": s.port,
    }))
}

async fn get_midi_ports(State(s): State<ServerState>) -> Json<Value> {
    let midi = s.midi.lock().unwrap();
    let ports: Vec<Value> = midi
        .list_ports()
        .into_iter()
        .enumerate()
        .map(|(i, name)| json!({ "index": i, "name": name }))
        .collect();
    Json(json!(ports))
}

async fn ws_handler(ws: WebSocketUpgrade, State(s): State<ServerState>) -> Response {
    ws.on_upgrade(|socket| handle_ws(socket, s))
}

async fn handle_ws(socket: WebSocket, state: ServerState) {
    let (mut sender, mut receiver) = socket.split();
    let mut broadcast_rx = state.broadcast_tx.subscribe();

    // Increment client count and broadcast
    let count = state.client_count.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = state.broadcast_tx.send(
        json!({ "type": "clients_updated", "count": count }).to_string()
    );

    // Send initial connected message
    let init_msg = {
        let midi = state.midi.lock().unwrap();
        json!({
            "type": "connected",
            "midiPort": midi.port_name,
            "midiConnected": midi.connected,
        }).to_string()
    };

    if sender.send(Message::Text(init_msg.into())).await.is_err() {
        state.client_count.fetch_sub(1, Ordering::SeqCst);
        return;
    }

    // Forward broadcasts to this client
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Receive MIDI commands from this client
    let midi = Arc::clone(&state.midi);
    let tx = state.broadcast_tx.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(cmd) = serde_json::from_str::<Value>(&text) {
                    handle_midi_command(&cmd, &midi, &tx);
                }
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    // Decrement and broadcast updated count
    let remaining = state.client_count.fetch_sub(1, Ordering::SeqCst) - 1;
    let _ = state.broadcast_tx.send(
        json!({ "type": "clients_updated", "count": remaining }).to_string()
    );
}

fn handle_midi_command(
    cmd: &Value,
    midi: &Arc<Mutex<MidiManager>>,
    tx: &broadcast::Sender<String>,
) {
    let ch = cmd["channel"].as_u64().unwrap_or(1) as u8;
    let mut midi = midi.lock().unwrap();
    match cmd["type"].as_str().unwrap_or("") {
        "note_on" => {
            midi.note_on(ch, cmd["note"].as_u64().unwrap_or(0) as u8, cmd["velocity"].as_u64().unwrap_or(127) as u8);
            let _ = tx.send(json!({ "type": "midi_activity" }).to_string());
        }
        "note_off" => {
            midi.note_off(ch, cmd["note"].as_u64().unwrap_or(0) as u8);
        }
        "cc" => {
            midi.cc(ch, cmd["cc"].as_u64().unwrap_or(0) as u8, cmd["value"].as_u64().unwrap_or(0) as u8);
            let _ = tx.send(json!({ "type": "midi_activity" }).to_string());
        }
        _ => {}
    }
}
