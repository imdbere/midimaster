export interface ButtonControl {
  type: 'button'
  id?: string
  label: string
  note?: number
  cc?: number
  value?: number
  velocity?: number
  channel?: number
  color?: string
  span?: number
  rowSpan?: number
}

export interface SliderControl {
  type: 'slider'
  id?: string
  label: string
  cc: number
  channel?: number
  min?: number
  max?: number
  default?: number
  color?: string
  span?: number
  rowSpan?: number
}

export interface ToggleControl {
  type: 'toggle'
  id?: string
  label: string
  note?: number
  cc?: number
  value?: number      // CC value when on (default 127)
  velocity?: number   // note velocity when on
  channel?: number
  color?: string
  span?: number
  rowSpan?: number
  default?: boolean   // initial on/off state (default false)
}

export type Control = ButtonControl | SliderControl | ToggleControl

export interface SurfaceLayout {
  columns?: number
  gap?: number
}

export interface SurfaceConfig {
  id: string
  name: string
  description?: string
  color?: string
  layout?: SurfaceLayout
  controls: Control[]
}

export interface SurfaceMeta {
  id: string
  name: string
  description?: string
  color?: string
  controlCount: number
}

export interface ServerInfo {
  mdnsHostname: string
  mdnsUrl: string
  localIp: string | null
  localUrl: string | null
  port: number
}
