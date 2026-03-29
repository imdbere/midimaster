// The Rust backend always runs on this port.
// If you change it here, also update `const PORT: u16` in src-tauri/src/lib.rs.
export const BACKEND_PORT = 3000

// In Tauri production the webview uses tauri:// protocol — relative URLs don't
// reach the Rust HTTP server. Use an absolute base URL in that context.
// In dev (Vite) and in browser clients, relative URLs work fine.
const isTauriProd = '__TAURI_INTERNALS__' in window && !import.meta.env.DEV

export const API_BASE = isTauriProd ? `http://localhost:${BACKEND_PORT}` : ''

export function wsUrl(): string {
  if (isTauriProd) return `ws://localhost:${BACKEND_PORT}/ws`
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}
