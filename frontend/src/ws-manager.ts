type WsListener = (msg: Record<string, unknown>) => void

class WsManager {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private listeners: WsListener[] = []

  connected = false
  midiPort: string | null = null

  onStatusChange: (() => void) | null = null

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws`
    this.setStatus(false)

    this.ws = new WebSocket(url)

    this.ws.addEventListener('open', () => {
      this.reconnectDelay = 1000
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
      this.scheduleReconnect()
    })

    this.ws.addEventListener('error', () => {
      this.ws?.close()
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 8000)
  }
}

export const wsManager = new WsManager()
