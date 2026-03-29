import ReconnectingWebSocket from 'partysocket/ws'
import { wsUrl } from './server-url'

type WsListener = (msg: Record<string, unknown>) => void

class WsManager {
  private ws: ReconnectingWebSocket | null = null
  private listeners: WsListener[] = []

  connected = false
  midiPort: string | null = null

  onStatusChange: (() => void) | null = null

  connect(): void {
    this.ws = new ReconnectingWebSocket(wsUrl(), undefined, {
      minReconnectionDelay: 1000,
      maxReconnectionDelay: 8000,
      reconnectionDelayGrowFactor: 1.5,
    })

    this.ws.addEventListener('message', ev => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(ev.data as string) as Record<string, unknown> } catch { return }

      if (msg.type === 'connected') {
        this.midiPort = (msg.midiPort as string) ?? null
        this.setStatus(true)
      }

      for (const fn of this.listeners) fn(msg)
    })

    this.ws.addEventListener('close', () => {
      this.setStatus(false)
    })

    this.ws.addEventListener('open', () => {
      // status set to true only after receiving 'connected' message from server
    })
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  on(fn: WsListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private setStatus(connected: boolean): void {
    this.connected = connected
    this.onStatusChange?.()
  }
}

export const wsManager = new WsManager()
