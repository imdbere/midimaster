use midir::{MidiOutput, MidiOutputConnection};
#[cfg(unix)]
use midir::os::unix::VirtualOutput;
use super::types::PortConfig;
#[cfg(windows)]
use super::te_virtual_midi::VirtualMidiPort;

/// Abstracts over a real midir connection and a Windows virtual port.
enum MidiConn {
    Real(MidiOutputConnection),
    #[cfg(windows)]
    WindowsVirtual(VirtualMidiPort),
}

impl MidiConn {
    fn send(&mut self, data: &[u8]) {
        match self {
            MidiConn::Real(conn) => { let _ = conn.send(data); }
            #[cfg(windows)]
            MidiConn::WindowsVirtual(port) => port.send(data),
        }
    }
}

pub struct MidiManager {
    connection: Option<MidiConn>,
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
    ) -> Result<(MidiConn, String), Box<dyn std::error::Error>> {
        match config {
            PortConfig::Virtual => {
                #[cfg(unix)]
                {
                    let output = MidiOutput::new("MidiMaster")?;
                    let conn = output.create_virtual("MidiMaster")?;
                    return Ok((MidiConn::Real(conn), "MidiMaster (virtual)".to_string()));
                }
                #[cfg(windows)]
                {
                    let port = VirtualMidiPort::new("MidiMaster")?;
                    return Ok((MidiConn::WindowsVirtual(port), "MidiMaster (virtual)".to_string()));
                }
                #[allow(unreachable_code)]
                Err("Virtual MIDI ports are not supported on this platform".into())
            }
            PortConfig::Index(i) => {
                let output = MidiOutput::new("MidiMaster")?;
                let ports = output.ports();
                let port = ports.get(*i).ok_or("Port index out of range")?;
                let name = output.port_name(port)?;
                let conn = output.connect(port, "MidiMaster")?;
                Ok((MidiConn::Real(conn), name))
            }
            PortConfig::Name(target) => {
                let output = MidiOutput::new("MidiMaster")?;
                let ports = output.ports();
                for port in &ports {
                    let name = output.port_name(port)?;
                    if name.to_lowercase().contains(&target.to_lowercase()) {
                        let conn = output.connect(port, "MidiMaster")?;
                        return Ok((MidiConn::Real(conn), name));
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
            conn.send(&[0x90 | (channel.saturating_sub(1) & 0x0F), note & 0x7F, velocity & 0x7F]);
        }
    }

    pub fn note_off(&mut self, channel: u8, note: u8) {
        if let Some(conn) = &mut self.connection {
            conn.send(&[0x80 | (channel.saturating_sub(1) & 0x0F), note & 0x7F, 0]);
        }
    }

    pub fn cc(&mut self, channel: u8, cc: u8, value: u8) {
        if let Some(conn) = &mut self.connection {
            conn.send(&[0xB0 | (channel.saturating_sub(1) & 0x0F), cc & 0x7F, value & 0x7F]);
        }
    }
}
