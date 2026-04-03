import { createSignal, onMount, Show, Switch, Match } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import type { Update } from '@tauri-apps/plugin-updater'
import { Download, AlertCircle } from 'lucide-solid'
import './UpdateBanner.css'

export function UpdateBanner() {
  const [phase, setPhase] = createSignal<'available' | 'downloading' | 'installing' | 'error' | null>(null)
  const [version, setVersion] = createSignal('')
  const [pct, setPct] = createSignal(0)
  let pending: Update | null = null

  onMount(async () => {
    try {
      const update = await check()
      if (!update) return
      pending = update
      setVersion(update.version)
      setPhase('available')
    } catch {
      // silently ignore — no update server configured, offline, etc.
    }
  })

  async function install() {
    if (!pending) return
    try {
      let downloaded = 0
      let total = 0
      await pending.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
          setPhase('downloading')
          setPct(0)
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setPct(total > 0 ? Math.round((downloaded / total) * 100) : 50)
        } else if (event.event === 'Finished') {
          setPhase('installing')
        }
      })
      await invoke('relaunch_app')
    } catch {
      setPhase('error')
    }
  }

  return (
    <Show when={phase() !== null}>
      <div class="da-update" classList={{ 'da-update-err': phase() === 'error' }}>
        <Switch>
          <Match when={phase() === 'available'}>
            <span class="da-update-icon"><Download size={13} /></span>
            <span class="da-update-label">v{version()} available</span>
            <button class="da-update-btn" onClick={install}>Install</button>
          </Match>
          <Match when={phase() === 'downloading'}>
            <span class="da-update-label">Downloading…</span>
            <div class="da-update-track">
              <div class="da-update-fill" style={{ width: `${pct()}%` }} />
            </div>
            <span class="da-update-pct">{pct()}%</span>
          </Match>
          <Match when={phase() === 'installing'}>
            <span class="da-update-label">Installing, relaunching…</span>
          </Match>
          <Match when={phase() === 'error'}>
            <span class="da-update-icon"><AlertCircle size={13} /></span>
            <span class="da-update-label">Update failed</span>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
