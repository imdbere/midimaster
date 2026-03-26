import { readFileSync, watch, readdirSync, statSync } from 'fs'
import { resolve, basename, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { EventEmitter } from 'events'
import type { SurfaceConfig, SurfaceMeta } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SURFACES_DIR = resolve(__dirname, '../config/surfaces')

export class SurfaceManager extends EventEmitter {
  private surfaces = new Map<string, SurfaceConfig>()
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor() {
    super()
    this.loadAll()
    this.watchDir()
  }

  private loadSurface(filePath: string): SurfaceConfig | null {
    try {
      const raw = readFileSync(filePath, 'utf8')
      const data = yaml.load(raw) as Record<string, unknown>
      const id = basename(filePath, extname(filePath))
      return {
        id,
        name: (data.name as string) ?? id,
        description: data.description as string | undefined,
        color: data.color as string | undefined,
        layout: data.layout as SurfaceConfig['layout'],
        controls: (data.controls as SurfaceConfig['controls']) ?? [],
      }
    } catch (err: unknown) {
      console.error(`Failed to load surface ${filePath}:`, (err as Error).message)
      return null
    }
  }

  private loadAll(): void {
    try {
      const files = readdirSync(SURFACES_DIR)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .sort()
      for (const file of files) {
        const surface = this.loadSurface(resolve(SURFACES_DIR, file))
        if (surface) {
          this.surfaces.set(surface.id, surface)
          console.log(`Loaded surface: ${surface.id} (${surface.name})`)
        }
      }
    } catch (err: unknown) {
      console.error('Failed to scan surfaces directory:', (err as Error).message)
    }
  }

  private watchDir(): void {
    try {
      watch(SURFACES_DIR, { persistent: false }, (_, filename) => {
        if (!filename) return
        if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) return

        const id = basename(filename, extname(filename))
        const timer = this.debounceTimers.get(id)
        if (timer) clearTimeout(timer)

        this.debounceTimers.set(id, setTimeout(() => {
          const filePath = resolve(SURFACES_DIR, filename)
          try {
            statSync(filePath)
            const surface = this.loadSurface(filePath)
            if (surface) {
              this.surfaces.set(surface.id, surface)
              console.log(`Surface updated: ${surface.id}`)
              this.emit('change', surface.id)
            }
          } catch {
            if (this.surfaces.has(id)) {
              this.surfaces.delete(id)
              console.log(`Surface removed: ${id}`)
              this.emit('change', id)
            }
          }
        }, 150))
      })
    } catch (err: unknown) {
      console.warn('Could not watch surfaces directory:', (err as Error).message)
    }
  }

  getAll(): SurfaceConfig[] {
    return [...this.surfaces.values()]
  }

  getMeta(): SurfaceMeta[] {
    return this.getAll().map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      color: s.color,
      controlCount: s.controls.length,
    }))
  }

  get(id: string): SurfaceConfig | undefined {
    return this.surfaces.get(id)
  }
}
