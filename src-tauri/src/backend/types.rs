use serde::{Deserialize, Serialize};

// ── Control types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "type")]
pub enum Control {
    Button(ButtonControl),
    Slider(SliderControl),
    Toggle(ToggleControl),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonControl {
    pub label: String,
    pub note: Option<u8>,
    pub cc: Option<u8>,
    pub value: Option<u8>,
    pub velocity: Option<u8>,
    pub channel: Option<u8>,
    pub color: Option<String>,
    pub span: Option<u32>,
    #[serde(rename = "rowSpan")]
    pub row_span: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SliderControl {
    pub label: String,
    pub cc: u8,
    pub channel: Option<u8>,
    pub min: Option<u8>,
    pub max: Option<u8>,
    pub default: Option<u8>,
    pub color: Option<String>,
    pub span: Option<u32>,
    #[serde(rename = "rowSpan")]
    pub row_span: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToggleControl {
    pub label: String,
    pub note: Option<u8>,
    pub cc: Option<u8>,
    pub value: Option<u8>,
    pub velocity: Option<u8>,
    pub channel: Option<u8>,
    pub color: Option<String>,
    pub span: Option<u32>,
    #[serde(rename = "rowSpan")]
    pub row_span: Option<u32>,
    pub default: Option<bool>,
}

// ── Surface ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SurfaceLayout {
    pub columns: Option<u32>,
    pub gap: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurfaceConfig {
    #[serde(skip_deserializing)]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub layout: Option<SurfaceLayout>,
    pub controls: Vec<Control>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurfaceMeta {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    #[serde(rename = "controlCount")]
    pub control_count: usize,
}

impl From<&SurfaceConfig> for SurfaceMeta {
    fn from(s: &SurfaceConfig) -> Self {
        SurfaceMeta {
            id: s.id.clone(),
            name: s.name.clone(),
            description: s.description.clone(),
            color: s.color.clone(),
            control_count: s.controls.len(),
        }
    }
}

// ── Server info ───────────────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    #[serde(rename = "mdnsHostname")]
    pub mdns_hostname: String,
    #[serde(rename = "mdnsUrl")]
    pub mdns_url: String,
    #[serde(rename = "localIp")]
    pub local_ip: Option<String>,
    #[serde(rename = "localUrl")]
    pub local_url: Option<String>,
    pub port: u16,
}

// ── MIDI port config ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum PortConfig {
    Virtual,
    Name(String),
    Index(usize),
}

impl<'de> Deserialize<'de> for PortConfig {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let v = serde_yaml::Value::deserialize(d)
            .map_err(|e| D::Error::custom(e.to_string()))?;
        match v {
            serde_yaml::Value::String(s) if s == "virtual" => Ok(PortConfig::Virtual),
            serde_yaml::Value::String(s) => Ok(PortConfig::Name(s)),
            serde_yaml::Value::Number(n) => {
                let i = n.as_u64().ok_or_else(|| D::Error::custom("invalid port index"))? as usize;
                Ok(PortConfig::Index(i))
            }
            _ => Ok(PortConfig::Virtual),
        }
    }
}
