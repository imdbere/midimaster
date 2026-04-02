import { createResource, createEffect, createSignal, For, Switch, Match, onCleanup } from 'solid-js'
import { useParams } from '@solidjs/router'
import { wsManager } from '../ws-manager'
import { setPageTitle } from '../state'
import type { SurfaceConfig, ButtonControl, SliderControl, ToggleControl, Control } from '../types'

// ── Grid span helper ───────────────────────────────────────────────────────

function spanStyle(ctrl: Control): Record<string, string> {
  const s: Record<string, string> = {}
  if (ctrl.span && ctrl.span > 1) s['grid-column'] = `span ${ctrl.span}`
  if (ctrl.rowSpan && ctrl.rowSpan > 1) s['grid-row'] = `span ${ctrl.rowSpan}`
  return s
}

// ── Button ─────────────────────────────────────────────────────────────────

function MidiButton(props: { ctrl: ButtonControl }) {
  const ctrl = props.ctrl
  const [active, setActive] = createSignal(false)

  function press() {
    if (ctrl.note != undefined) {
      wsManager.send({ type: 'note_on', note: ctrl.note, velocity: ctrl.velocity ?? 127, channel: ctrl.channel ?? 1 })
    } else if (ctrl.cc != undefined) {
      wsManager.send({ type: 'cc', cc: ctrl.cc, value: ctrl.value ?? 127, channel: ctrl.channel ?? 1 })
    }
  }

  function release() {
    if (ctrl.note != undefined) {
      wsManager.send({ type: 'note_off', note: ctrl.note, channel: ctrl.channel ?? 1 })
    } else if (ctrl.cc != undefined) {
      // CC buttons: no release message — value was already sent on press
    }
  }

  return (
    <div
      class="control button"
      classList={{ active: active() }}
      style={{ '--color': ctrl.color ?? '#2c2c2c', ...spanStyle(ctrl) }}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true)
        press()
      }}
      onPointerUp={() => { setActive(false); release() }}
      onPointerCancel={() => { setActive(false); release() }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="label">{ctrl.label}</span>
    </div>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────

function MidiSlider(props: { ctrl: SliderControl }) {
  const ctrl = props.ctrl
  const min = ctrl.min ?? 0
  const max = ctrl.max ?? 127
  const defaultVal = ctrl.default ?? Math.round((min + max) / 2)
  const [value, setValue] = createSignal(defaultVal)

  let lastSentAt = 0
  const THROTTLE_MS = 16

  function sendCC(val: number) {
    wsManager.send({ type: 'cc', cc: ctrl.cc, value: val, channel: ctrl.channel ?? 1 })
  }

  return (
    <div
      class="control slider"
      style={{ '--color': ctrl.color ?? '#555', ...spanStyle(ctrl) }}
    >
      <div class="slider-header">
        <span class="label">{ctrl.label}</span>
        <span class="value">{value()}</span>
      </div>
      <div class="slider-track">
        <input
          type="range"
          min={min}
          max={max}
          value={defaultVal}
          step={1}
          onInput={(e) => {
            const val = parseInt(e.currentTarget.value, 10)
            setValue(val)
            const now = Date.now()
            if (now - lastSentAt >= THROTTLE_MS) {
              sendCC(val)
              lastSentAt = now
            }
          }}
          onChange={(e) => {
            const val = parseInt(e.currentTarget.value, 10)
            setValue(val)
            sendCC(val)
          }}
        />
      </div>
    </div>
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────

function MidiToggle(props: { ctrl: ToggleControl }) {
  const ctrl = props.ctrl
  const [on, setOn] = createSignal(ctrl.default ?? false)

  function toggle() {
    const next = !on()
    setOn(next)
    if (ctrl.note !== undefined) {
      wsManager.send(next
        ? { type: 'note_on', note: ctrl.note, velocity: ctrl.velocity ?? 127, channel: ctrl.channel ?? 1 }
        : { type: 'note_off', note: ctrl.note, channel: ctrl.channel ?? 1 }
      )
    } else if (ctrl.cc !== undefined) {
      wsManager.send({ type: 'cc', cc: ctrl.cc, value: next ? (ctrl.value ?? 127) : 0, channel: ctrl.channel ?? 1 })
    }
  }

  return (
    <div
      class="control toggle"
      classList={{ on: on() }}
      style={{ '--color': ctrl.color ?? '#2c2c2c', ...spanStyle(ctrl) }}
      onClick={toggle}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="label">{ctrl.label}</span>
      <span class="toggle-pip" />
    </div>
  )
}

// ── Surface page ───────────────────────────────────────────────────────────

export default function Surface() {
  const params = useParams<{ id: string }>()

  const [config, { refetch }] = createResource(
    () => params.id,
    async (id): Promise<SurfaceConfig> => {
      const res = await fetch(`/api/surfaces/${id}`)
      if (!res.ok) throw new Error(`Surface not found: ${id}`)
      return res.json()
    }
  )

  createEffect(() => {
    const c = config()
    if (c) setPageTitle(c.name.toUpperCase())
  })

  const unsub = wsManager.on(msg => {
    if (msg.type === 'surfaces_updated') refetch()
  })
  onCleanup(unsub)

  return (
    <div
      class="controls-grid"
      style={{
        'grid-template-columns': `repeat(${config()?.layout?.columns ?? 4}, 1fr)`,
        'grid-template-rows': `repeat(${config()?.layout?.rows ?? 10}, 1fr)`,
        'gap': `${config()?.layout?.gap ?? 10}px`,
      }}
    >
      <For each={config()?.controls}>
        {(ctrl) => (
          <Switch>
            <Match when={ctrl.type === 'button'}>
              <MidiButton ctrl={ctrl as ButtonControl} />
            </Match>
            <Match when={ctrl.type === 'slider'}>
              <MidiSlider ctrl={ctrl as SliderControl} />
            </Match>
            <Match when={ctrl.type === 'toggle'}>
              <MidiToggle ctrl={ctrl as ToggleControl} />
            </Match>
          </Switch>
        )}
      </For>
    </div>
  )
}
