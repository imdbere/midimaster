import { createResource, createSignal, For, Show, onCleanup } from 'solid-js'
import { A } from '@solidjs/router'
import { Copy, Check, ChevronRight } from 'lucide-solid'
import { renderSVG } from 'uqr'
import { wsManager } from '../ws-manager'
import { setPageTitle } from '../state'
import type { SurfaceMeta, ServerInfo } from '../types'

function CopyBtn(props: { text: string }) {
  const [copied, setCopied] = createSignal(false)

  function copy() {
    // Prefer Clipboard API (requires HTTPS), fall back to execCommand (works on HTTP)
    const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(props.text).then(finish).catch(execFallback)
    } else {
      execFallback()
    }

    function execFallback() {
      const el = document.createElement('input')
      el.value = props.text
      el.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      el.setSelectionRange(0, 99999)
      try { if (document.execCommand('copy')) finish() } catch(e) { }
      document.body.removeChild(el)
    }
  }

  return (
    <button
      class="copy-btn"
      classList={{ copied: copied() }}
      onClick={copy}
      title="Copy to clipboard"
    >
      <Show when={copied()} fallback={<Copy size={13} />}>
        <Check size={13} />
      </Show>
    </button>
  )
}

function qrSvg(url: string): string {
  const svg = renderSVG(url)
  // Remove inline width/height so CSS can control sizing
  return svg
    .replace(/\swidth="\d+"/, '')
    .replace(/\sheight="\d+"/, '')
}

export default function Overview() {
  setPageTitle('MIDIMASTER')

  const [surfaces, { refetch }] = createResource<SurfaceMeta[]>(async () => {
    const res = await fetch('/api/surfaces')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

  const [info] = createResource<ServerInfo>(async () => {
    const res = await fetch('/api/info')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

  const unsub = wsManager.on(msg => {
    if (msg.type === 'surfaces_updated') refetch()
  })
  onCleanup(unsub)

  return (
    <div class="overview">

      {/* ── Surface list ── */}
      <section class="surface-list">
        <For
          each={surfaces()}
          fallback={
            <p class="empty-msg">
              {surfaces.loading ? 'loading…' : 'No surfaces found in config/surfaces/'}
            </p>
          }
        >
          {(surface) => (
            <A
              href={`/surface/${surface.id}`}
              class="surface-card"
              style={{ '--color': surface.color ?? '#2c2c2c' }}
            >
              <div class="card-body">
                <span class="card-name">{surface.name}</span>
                <Show when={surface.description}>
                  <span class="card-desc">{surface.description}</span>
                </Show>
              </div>
              <ChevronRight size={18} class="card-arrow" />
            </A>
          )}
        </For>
      </section>

      {/* ── Share ── */}
      <Show when={info()}>
        {(i) => {
          // Use the port the user is actually on, not the backend's hardcoded port
          const port = window.location.port ? `:${window.location.port}` : ''
          const mdnsUrl = () => `http://${i().mdnsHostname}${port}`
          const ipUrl = () => i().localIp ? `http://${i().localIp}${port}` : null
          const qrUrl = () => ipUrl() ?? mdnsUrl()

          return (
            <section class="share-section">
              <div class="share-label">SHARE</div>

              <div class="share-url-row">
                <span class="url-tag">mDNS</span>
                <span class="url-value">{mdnsUrl()}</span>
                <CopyBtn text={mdnsUrl()} />
              </div>

              <Show when={ipUrl()}>
                {(url) => (
                  <div class="share-url-row">
                    <span class="url-tag">IP</span>
                    <span class="url-value">{url()}</span>
                    <CopyBtn text={url()} />
                  </div>
                )}
              </Show>

              <div class="qr-wrap">
                <div class="qr-img" innerHTML={qrSvg(qrUrl())} />
                <p class="qr-hint">Scan to open on another device</p>
              </div>
            </section>
          )
        }}
      </Show>

    </div>
  )
}
