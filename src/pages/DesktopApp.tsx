import { createResource, createSignal, onCleanup, Show } from 'solid-js'
import { renderSVG } from 'uqr'
import { writeClipboard } from '@solid-primitives/clipboard'
import { invoke } from '@tauri-apps/api/core'
import { Copy, Check, ExternalLink, FolderOpen, Power } from 'lucide-solid'
import { wsManager } from '../ws-manager'
import { wsConnected } from '../ws'
import type { ServerInfo } from '../types'

function qrSvg(url: string): string {
  const svg = renderSVG(url)
  return svg
    .replace(/\swidth="\d+"/, '')
    .replace(/\sheight="\d+"/, '')
}

export default function DesktopApp() {
  const [info] = createResource<ServerInfo>(async () => {
    const res = await fetch('/api/info')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

  const [clientCount, setClientCount] = createSignal(0)
  const [midiFlash, setMidiFlash] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

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

  function getShareUrl(i: ServerInfo): string {
    const port = i.port !== 80 && i.port !== 443 ? `:${i.port}` : ''
    return i.localIp ? `http://${i.localIp}${port}` : `http://${i.mdnsHostname}${port}`
  }

  function copyLink() {
    const i = info()
    if (!i) return
    const url = getShareUrl(i)
    const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    writeClipboard(url).then(finish).catch(finish)
  }

  function openInBrowser() {
    const i = info()
    if (!i) return
    invoke('open_in_browser', { url: getShareUrl(i) })
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
              <div class="da-qr" innerHTML={qrSvg(getShareUrl(i()))} />
            </div>

            <div class="da-url-row">
              <span class="da-url">{getShareUrl(i())}</span>
              <button
                class="da-icon-btn"
                classList={{ copied: copied() }}
                onClick={copyLink}
                title="Copy link"
              >
                <Show when={copied()} fallback={<Copy size={15} />}>
                  <Check size={15} />
                </Show>
              </button>
              <button class="da-icon-btn" onClick={openInBrowser} title="Open in browser">
                <ExternalLink size={15} />
              </button>
            </div>

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

            <p class="da-hint">Scan QR or share URL to open on a phone or tablet</p>

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
