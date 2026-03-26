import { createSignal } from 'solid-js'
import { wsManager } from './ws-manager'

export const [wsConnected, setWsConnected] = createSignal(false)
export const [wsMidiPort, setWsMidiPort] = createSignal<string | null>(null)

wsManager.onStatusChange = () => {
  setWsConnected(wsManager.connected)
  setWsMidiPort(wsManager.midiPort)
}

wsManager.connect()
