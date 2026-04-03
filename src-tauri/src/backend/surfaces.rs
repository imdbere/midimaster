use super::types::{SurfaceConfig, SurfaceMeta};
use notify_debouncer_mini::{
    new_debouncer, notify::RecursiveMode, DebounceEventResult, DebouncedEventKind,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

pub struct SurfaceManager {
    surfaces: HashMap<String, SurfaceConfig>,
    pub dir: PathBuf,
}

impl SurfaceManager {
    pub fn new(dir: PathBuf) -> Self {
        let mut mgr = SurfaceManager {
            surfaces: HashMap::new(),
            dir,
        };
        mgr.reload();
        mgr
    }

    pub fn reload(&mut self) {
        self.surfaces.clear();
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("yaml") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if stem.is_empty() {
                continue;
            }
            match load_surface(&path, &stem) {
                Ok(surface) => {
                    self.surfaces.insert(stem, surface);
                }
                Err(e) => eprintln!("Failed to load {path:?}: {e}"),
            }
        }
    }

    pub fn get_meta(&self) -> Vec<SurfaceMeta> {
        let mut v: Vec<SurfaceMeta> = self.surfaces.values().map(SurfaceMeta::from).collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub fn get(&self, id: &str) -> Option<&SurfaceConfig> {
        self.surfaces.get(id)
    }
}

fn load_surface(path: &Path, id: &str) -> Result<SurfaceConfig, Box<dyn std::error::Error>> {
    let raw = std::fs::read_to_string(path)?;
    let mut surface: SurfaceConfig = serde_yaml::from_str(&raw)?;
    surface.id = id.to_string();
    Ok(surface)
}

/// Spawn a background thread that watches the surfaces directory and sends
/// a notification on `tx` whenever files change.
pub fn watch_surfaces(
    dir: PathBuf,
    surfaces: Arc<RwLock<SurfaceManager>>,
    tx: broadcast::Sender<()>,
) {
    std::thread::spawn(move || {
        let (debounce_tx, debounce_rx) = std::sync::mpsc::channel::<DebounceEventResult>();

        let mut debouncer = new_debouncer(std::time::Duration::from_millis(150), debounce_tx)
            .expect("Failed to create file watcher");

        debouncer
            .watcher()
            .watch(&dir, RecursiveMode::NonRecursive)
            .expect("Failed to watch surfaces dir");

        for result in debounce_rx {
            let has_yaml = result.unwrap_or_default().iter().any(|e| {
                matches!(e.kind, DebouncedEventKind::Any)
                    && e.path.extension().and_then(|x| x.to_str()) == Some("yaml")
            });

            if has_yaml {
                if let Ok(mut mgr) = surfaces.write() {
                    mgr.reload();
                }
                let _ = tx.send(());
            }
        }
    });
}
