import { createResource, createSignal, onCleanup, Show } from 'solid-js'
import { renderSVG } from 'uqr'
import { invoke } from '@tauri-apps/api/core'
import { ExternalLink, FolderOpen, Power } from 'lucide-solid'
import { wsManager } from '../ws-manager'
import { wsConnected } from '../ws'
import { API_BASE, BACKEND_PORT } from '../server-url'
import type { ServerInfo } from '../types'
import { CopyBtn } from '../components/CopyBtn'
import { UpdateBanner } from '../components/UpdateBanner'
import './DesktopApp.css'

function qrSvg(url: string): string {
  const svg = renderSVG(url)
  return svg
    .replace(/\swidth="\d+"/, '')
    .replace(/\sheight="\d+"/, '')
}

export default function DesktopApp() {
  const [info] = createResource<ServerInfo>(async () => {
    const res = await fetch(`${API_BASE}/api/info`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

  const [clientCount, setClientCount] = createSignal(0)
  const [midiFlash, setMidiFlash] = createSignal(false)

  let midiTimer: ReturnType<typeof setTimeout> | null = null

  const unsub = wsManager.on(msg => {
    if (msg.type === 'clients_updated') {
      setClientCount((msg.count as number) ?? 0)
    }
    if (msg.type === 'midi_activity') {
      setMidiFlash(true)
      if (midiTimer) clearTimeout(midiTimer)
      midiTimer = setTimeout(() => setMidiFlash(false), 150)
    }
  })
  onCleanup(() => {
    unsub()
    if (midiTimer) clearTimeout(midiTimer)
  })

  function port(): string {
    return window.location.port || String(BACKEND_PORT)
  }

  function getMdnsUrl(i: ServerInfo): string {
    return `http://${i.mdnsHostname}:${port()}`
  }

  function getIpUrl(i: ServerInfo): string | null {
    return i.localIp ? `http://${i.localIp}:${port()}` : null
  }

  function getQrUrl(i: ServerInfo): string {
    // Use IP for QR — mDNS .local names don't resolve on Android browsers
    return getIpUrl(i) ?? getMdnsUrl(i)
  }

  function openInBrowser(url: string) {
    invoke('open_in_browser', { url })
  }

  function openConfigFolder() {
    invoke('open_config_folder')
  }

  function quit() {
    invoke('quit_app')
  }

  return (
    <div class="desktop-app">
      <Show when={info()} fallback={<p class="loading">Starting server…</p>}>
        {(i) => (
          <>
            <div class="da-qr-wrap">
              <div class="da-qr" innerHTML={qrSvg(getQrUrl(i()))} />
            </div>

            <div class="da-url-row">
              <span class="url-tag">mDNS</span>
              <span class="da-url">{getMdnsUrl(i())}</span>
              <CopyBtn text={getMdnsUrl(i())} />
              <button class="da-icon-btn" onClick={() => openInBrowser(getMdnsUrl(i()))} title="Open in browser">
                <ExternalLink size={15} />
              </button>
            </div>

            <Show when={getIpUrl(i())}>
              {(url) => (
                <div class="da-url-row">
                  <span class="url-tag">IP</span>
                  <span class="da-url">{url()}</span>
                  <CopyBtn text={url()} />
                  <button class="da-icon-btn" onClick={() => openInBrowser(url())} title="Open in browser">
                    <ExternalLink size={15} />
                  </button>
                </div>
              )}
            </Show>

            <div class="da-status-row">
              <div class="da-stat">
                <span class="da-stat-value">{clientCount()}</span>
                <span class="da-stat-label">connected</span>
              </div>
              <div class="da-stat">
                <span class="da-midi-dot" classList={{ active: midiFlash() }} />
                <span class="da-stat-label">MIDI</span>
              </div>
              <div class="da-stat">
                <span class="da-ws-dot" classList={{ connected: wsConnected() }} />
                <span class="da-stat-label">{wsConnected() ? 'online' : 'offline'}</span>
              </div>
            </div>

            <p class="da-hint">Scan QR code or share URL to open on a phone or tablet</p>

            <UpdateBanner />

            <div class="da-actions">
              <button class="da-action-btn" onClick={openConfigFolder} title="Open config folder">
                <FolderOpen size={14} />
                Config
              </button>
              <button class="da-action-btn da-action-quit" onClick={quit} title="Quit MidiMaster">
                <Power size={14} />
                Quit
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
