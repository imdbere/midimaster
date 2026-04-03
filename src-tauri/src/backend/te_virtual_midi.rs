//! FFI bindings to the teVirtualMIDI Windows driver DLL.
//!
//! Creates a virtual MIDI *input* device (from the DAW's perspective) so that
//! Ableton and other DAWs can receive MIDI from MidiMaster without needing
//! loopMIDI configured as a separate loopback cable.
//!
//! Requires the teVirtualMIDI kernel driver to be installed on the target
//! system. Installing loopMIDI (tobias-erichsen.de/software/loopmidi.html)
//! bundles the driver and is the easiest way to get it.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

/// Create a TX-only port: our private backend sends data, DAW sees a MIDI
/// input device it can receive notes/CC from.
const TE_VM_FLAGS_INSTANTIATE_TX_ONLY: u32 = 8;

/// Opaque port handle returned by the DLL.
#[repr(C)]
struct VmMidiPort {
    _opaque: [u8; 0],
}

// Linked via build.rs (teVirtualMIDI64.lib / teVirtualMIDI32.lib).
extern "system" {
    fn virtualMIDICreatePortEx2(
        port_name: *const u16,
        callback: Option<unsafe extern "system" fn(*mut VmMidiPort, *mut u8, u32, usize)>,
        dw_callback_instance: usize,
        max_sysex_length: u32,
        flags: u32,
    ) -> *mut VmMidiPort;

    fn virtualMIDIClosePort(midi_port: *mut VmMidiPort);

    fn virtualMIDISendData(
        midi_port: *mut VmMidiPort,
        midi_data_bytes: *const u8,
        length: u32,
    ) -> i32; // BOOL
}

/// RAII wrapper around a teVirtualMIDI port handle.
pub struct VirtualMidiPort {
    port: *mut VmMidiPort,
}

// Safety: the teVirtualMIDI DLL serialises concurrent calls internally, and
// MidiManager is always accessed behind a Mutex, so there is no concurrent
// access from our side.
unsafe impl Send for VirtualMidiPort {}

impl VirtualMidiPort {
    pub fn new(name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Wide (UTF-16) NUL-terminated string required by the Windows API.
        let wide: Vec<u16> = OsStr::new(name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let port = unsafe {
            virtualMIDICreatePortEx2(
                wide.as_ptr(),
                None, // no RX callback needed (TX-only port)
                0,
                65535, // max sysex length
                TE_VM_FLAGS_INSTANTIATE_TX_ONLY,
            )
        };

        if port.is_null() {
            Err(format!(
                "Failed to create virtual MIDI port '{name}'. \
                 Make sure the teVirtualMIDI driver is installed \
                 (install loopMIDI from tobias-erichsen.de to get it)."
            )
            .into())
        } else {
            Ok(Self { port })
        }
    }

    /// Send a single complete MIDI message (1–3 bytes, or sysex).
    pub fn send(&self, data: &[u8]) {
        if data.is_empty() {
            return;
        }
        unsafe {
            virtualMIDISendData(self.port, data.as_ptr(), data.len() as u32);
        }
    }
}

impl Drop for VirtualMidiPort {
    fn drop(&mut self) {
        unsafe { virtualMIDIClosePort(self.port) }
    }
}
