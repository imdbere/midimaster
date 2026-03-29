use midir::{MidiOutput, MidiOutputConnection};
#[cfg(unix)]
use midir::os::unix::VirtualOutput;
use super::types::PortConfig;

pub struct MidiManager {
    connection: Option<MidiOutputConnection>,
    pub port_name: String,
    pub connected: bool,
}

impl MidiManager {
    pub fn new() -> Self {
        MidiManager {
            connection: None,
            port_name: String::new(),
            connected: false,
        }
    }

    pub fn connect(&mut self, config: &PortConfig) {
        match self.try_connect(config) {
            Ok((conn, name)) => {
                self.connection = Some(conn);
                self.port_name = name;
                self.connected = true;
            }
            Err(e) => {
                eprintln!("MIDI connect error: {e}");
            }
        }
    }

    fn try_connect(
        &self,
        config: &PortConfig,
    ) -> Result<(MidiOutputConnection, String), Box<dyn std::error::Error>> {
        let output = MidiOutput::new("MidiMaster")?;

        match config {
            PortConfig::Virtual => {
                let conn = output.create_virtual("MidiMaster")?;
                Ok((conn, "MidiMaster (virtual)".to_string()))
            }
            PortConfig::Index(i) => {
                let ports = output.ports();
                let port = ports.get(*i).ok_or("Port index out of range")?;
                let name = output.port_name(port)?;
                let conn = output.connect(port, "MidiMaster")?;
                Ok((conn, name))
            }
            PortConfig::Name(target) => {
                let ports = output.ports();
                for port in &ports {
                    let name = output.port_name(port)?;
                    if name.to_lowercase().contains(&target.to_lowercase()) {
                        let conn = output.connect(port, "MidiMaster")?;
                        return Ok((conn, name));
                    }
                }
                Err(format!("No MIDI port matching '{target}'").into())
            }
        }
    }

    pub fn list_ports(&self) -> Vec<String> {
        let Ok(output) = MidiOutput::new("MidiMaster-list") else {
            return vec![];
        };
        output
            .ports()
            .iter()
            .filter_map(|p| output.port_name(p).ok())
            .collect()
    }

    /// channel is 1-indexed (1–16)
    pub fn note_on(&mut self, channel: u8, note: u8, velocity: u8) {
        if let Some(conn) = &mut self.connection {
            let _ = conn.send(&[0x90 | (channel.saturating_sub(1) & 0x0F), note & 0x7F, velocity & 0x7F]);
        }
    }

    pub fn note_off(&mut self, channel: u8, note: u8) {
        if let Some(conn) = &mut self.connection {
            let _ = conn.send(&[0x80 | (channel.saturating_sub(1) & 0x0F), note & 0x7F, 0]);
        }
    }

    pub fn cc(&mut self, channel: u8, cc: u8, value: u8) {
        if let Some(conn) = &mut self.connection {
            let _ = conn.send(&[0xB0 | (channel.saturating_sub(1) & 0x0F), cc & 0x7F, value & 0x7F]);
        }
    }
}
