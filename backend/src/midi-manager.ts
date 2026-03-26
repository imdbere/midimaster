import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const midi = require('midi') as any

export class MidiManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private output: any
  connected = false
  portName: string | null = null

  constructor() {
    this.output = new midi.Output()
  }

  listPorts(): Array<{ index: number; name: string }> {
    const count: number = this.output.getPortCount()
    return Array.from({ length: count }, (_, i) => ({
      index: i,
      name: this.output.getPortName(i) as string,
    }))
  }

  connect(portConfig?: string | number): void {
    if (this.connected) {
      try { this.output.closePort() } catch { /* ignore */ }
      this.connected = false
      this.portName = null
    }

    const cfg = portConfig ?? 'virtual'

    if (cfg === 'virtual') {
      this.output.openVirtualPort('MidiMaster')
      this.portName = 'MidiMaster (virtual)'
      this.connected = true
      console.log('Opened virtual MIDI port: MidiMaster')
      return
    }

    const ports = this.listPorts()

    if (typeof cfg === 'number') {
      const port = ports[cfg]
      if (!port) throw new Error(`MIDI port index ${cfg} not found`)
      this.output.openPort(cfg)
      this.portName = port.name
      this.connected = true
      console.log(`Opened MIDI port [${cfg}]: ${this.portName}`)
    } else {
      const needle = String(cfg).toLowerCase()
      const port = ports.find(p => p.name.toLowerCase().includes(needle))
      if (!port) {
        const available = ports.map(p => `"${p.name}"`).join(', ') || 'none'
        throw new Error(`MIDI port "${cfg}" not found. Available: ${available}`)
      }
      this.output.openPort(port.index)
      this.portName = port.name
      this.connected = true
      console.log(`Opened MIDI port: ${this.portName}`)
    }
  }

  /** channel is 1-indexed (MIDI convention) */
  noteOn(channel: number, note: number, velocity: number): void {
    if (!this.connected) return
    const ch = (Math.max(1, Math.min(16, channel)) - 1) & 0x0f
    this.output.sendMessage([0x90 | ch, note & 0x7f, velocity & 0x7f])
  }

  noteOff(channel: number, note: number): void {
    if (!this.connected) return
    const ch = (Math.max(1, Math.min(16, channel)) - 1) & 0x0f
    this.output.sendMessage([0x80 | ch, note & 0x7f, 0])
  }

  cc(channel: number, controller: number, value: number): void {
    if (!this.connected) return
    const ch = (Math.max(1, Math.min(16, channel)) - 1) & 0x0f
    this.output.sendMessage([0xb0 | ch, controller & 0x7f, value & 0x7f])
  }

  close(): void {
    if (this.connected) {
      try { this.output.closePort() } catch { /* ignore */ }
      this.connected = false
    }
  }
}
