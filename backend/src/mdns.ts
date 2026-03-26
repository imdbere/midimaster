import os from 'os'
import { getResponder } from '@homebridge/ciao'

export function getMdnsId(): string {
  return os.hostname()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 10)
}

export function getMdnsHostname(): string {
  return `midimaster-${getMdnsId()}`
}

export function getLocalIp(): string | null {
  const ifaces = os.networkInterfaces()
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return null
}

export async function advertiseMdns(port: number): Promise<void> {
  const hostname = getMdnsHostname()
  try {
    const responder = getResponder()
    const service = responder.createService({
      name: 'MidiMaster',
      type: 'http',
      port,
      hostname,
      txt: { path: '/' },
    })
    await service.advertise()
    console.log(`mDNS: http://${hostname}.local:${port}`)
  } catch (err: unknown) {
    console.warn('mDNS advertisement failed:', (err as Error).message)
  }
}
