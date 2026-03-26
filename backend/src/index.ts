import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import cors from 'cors'
import yaml from 'js-yaml'
import { MidiManager } from './midi-manager.js'
import { SurfaceManager } from './surface-manager.js'
import { advertiseMdns, getMdnsHostname, getLocalIp } from './mdns.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT ?? '3000', 10)

// Load global MIDI settings
let midiPort: string | number = 'virtual'
try {
  const raw = readFileSync(resolve(__dirname, '../config/settings.yaml'), 'utf8')
  const settings = yaml.load(raw) as Record<string, unknown>
  const midiCfg = settings?.midi as Record<string, unknown> | undefined
  if (midiCfg?.port !== undefined) midiPort = midiCfg.port as string | number
} catch { /* use default */ }

const app = express()
app.use(cors())
app.use(express.json())

const midi = new MidiManager()
const surfaces = new SurfaceManager()

try {
  midi.connect(midiPort)
} catch (err: unknown) {
  console.warn('MIDI:', (err as Error).message)
}

// Serve built frontend
app.use(express.static(resolve(__dirname, '../../frontend/dist')))

// ── API ──────────────────────────────────────────────────────────────────────

app.get('/api/surfaces', (_, res) => {
  res.json(surfaces.getMeta())
})

app.get('/api/surfaces/:id', (req, res) => {
  const surface = surfaces.get(req.params.id)
  if (!surface) return void res.status(404).json({ error: 'Surface not found' })
  res.json(surface)
})

app.get('/api/info', (_, res) => {
  const hostname = getMdnsHostname()
  const ip = getLocalIp()
  res.json({
    mdnsHostname: `${hostname}.local`,
    mdnsUrl: `http://${hostname}.local:${PORT}`,
    localIp: ip,
    localUrl: ip ? `http://${ip}:${PORT}` : null,
    port: PORT,
  })
})


app.get('/midi/ports', (_, res) => {
  res.json(midi.listPorts())
})

// ── WebSocket ────────────────────────────────────────────────────────────────

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

function broadcast(msg: object): void {
  const data = JSON.stringify(msg)
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  })
}

surfaces.on('change', () => {
  broadcast({ type: 'surfaces_updated' })
})

wss.on('connection', ws => {
  console.log('Client connected')

  ws.send(JSON.stringify({
    type: 'connected',
    midiPort: midi.portName,
    midiConnected: midi.connected,
  }))

  ws.on('message', raw => {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(raw.toString()) as Record<string, unknown> } catch { return }

    try {
      const ch = (msg.channel as number) ?? 1
      switch (msg.type) {
        case 'note_on':
          midi.noteOn(ch, msg.note as number, (msg.velocity as number) ?? 127)
          break
        case 'note_off':
          midi.noteOff(ch, msg.note as number)
          break
        case 'cc':
          midi.cc(ch, msg.cc as number, msg.value as number)
          break
      }
    } catch (err: unknown) {
      ws.send(JSON.stringify({ type: 'error', message: (err as Error).message }))
    }
  })

  ws.on('close', () => console.log('Client disconnected'))
  ws.on('error', err => console.error('WS error:', err.message))
})

process.on('SIGINT', () => {
  midi.close()
  process.exit(0)
})

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`MidiMaster on http://0.0.0.0:${PORT}`)
  const ip = getLocalIp()
  if (ip) console.log(`Network:   http://${ip}:${PORT}`)
  console.log(`MIDI ports: ${JSON.stringify(midi.listPorts().map(p => p.name))}`)
  await advertiseMdns(PORT)
})
