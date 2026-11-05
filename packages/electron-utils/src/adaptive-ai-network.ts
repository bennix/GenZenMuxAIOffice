import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import {
  createAdaptiveAiFetch,
  aiFetch,
  setAiFetch,
  type AiRoute,
  type AiNetworkStatus,
  type AiNetworkPreferences,
} from '@genoffice/ai-provider'

interface RouteSession {
  setProxy(config: {
    mode: 'system' | 'direct' | 'fixed_servers'
    proxyRules?: string
  }): Promise<void>
  fetch(url: string, init?: RequestInit): Promise<Response>
}
interface ElectronNetworkHost {
  app: { whenReady(): Promise<void>; getPath(name: 'userData'): string }
  session: { fromPartition(name: string, options?: { cache: boolean }): RouteSession }
}
type ProxyConfig = Parameters<RouteSession['setProxy']>[0]
const selectedConfigs = new Map<string, ProxyConfig>()
export async function prepareAiNetworkSession(
  target: Pick<RouteSession, 'setProxy'>,
  url: string,
): Promise<void> {
  installAdaptiveAiNetwork()
  const response = await aiFetch(url, { method: 'HEAD', signal: AbortSignal.timeout(12000) })
  await response.body?.cancel()
  const config = selectedConfigs.get(new URL(url).origin)
  if (config) await target.setProxy(config)
}

let preferences: AiNetworkPreferences | undefined
let preferenceLoad: Promise<AiNetworkPreferences> | undefined
let generation = 0
function electronHost(): ElectronNetworkHost {
  return createRequire(import.meta.url)('electron') as ElectronNetworkHost
}
export function validateAiNetworkPreferences(value: AiNetworkPreferences): AiNetworkPreferences {
  if (!value || !['auto', 'system', 'direct', 'manual'].includes(value.mode))
    throw new Error('Invalid network mode')
  if (value.mode !== 'manual') return { mode: value.mode }
  let url: URL
  try {
    url = new URL(value.proxyUrl ?? '')
  } catch {
    throw new Error('Use a valid HTTP, HTTPS or SOCKS5 proxy URL.')
  }
  if (
    !['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname)
  )
    throw new Error(
      'Proxy must be an HTTP/HTTPS/SOCKS5 address without credentials, query or path.',
    )
  return {
    mode: 'manual',
    proxyUrl: `${url.protocol === 'socks5h:' ? 'socks5:' : url.protocol}//${url.host}`,
  }
}
export async function getAiNetworkPreferences(): Promise<AiNetworkPreferences> {
  if (preferences) return { ...preferences }
  preferenceLoad ??= (async () => {
    const host = electronHost()
    await host.app.whenReady()
    try {
      preferences = validateAiNetworkPreferences(
        JSON.parse(
          await readFile(join(host.app.getPath('userData'), 'ai-network.json'), 'utf8'),
        ) as AiNetworkPreferences,
      )
    } catch {
      preferences = { mode: 'auto' }
    }
    return preferences
  })()
  return { ...(await preferenceLoad) }
}
export async function setAiNetworkPreferences(
  value: AiNetworkPreferences,
): Promise<AiNetworkPreferences> {
  const validated = validateAiNetworkPreferences(value)
  const host = electronHost()
  await host.app.whenReady()
  await getAiNetworkPreferences()
  const dir = host.app.getPath('userData')
  await mkdir(dir, { recursive: true })
  const temporary = join(dir, `.ai-network-${randomUUID()}.json`)
  await writeFile(temporary, JSON.stringify(validated), { mode: 0o600 })
  await rename(temporary, join(dir, 'ai-network.json'))
  preferences = validated
  resetAiNetwork()
  return { ...validated }
}
export function resetAiNetwork(): void {
  installed = false
  selectedConfigs.clear()
  status = { mode: preferences?.mode ?? 'auto', state: 'unavailable', checkedAt: 0 }
  installAdaptiveAiNetwork()
}
let installed = false
let status: AiNetworkStatus = { mode: 'system', state: 'unavailable', checkedAt: 0 }
export function getAiNetworkStatus(): AiNetworkStatus {
  return { ...status }
}

async function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(200)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

/** Lazy installation; never blocks application startup or changes system-wide settings. */
export function installAdaptiveAiNetwork(): void {
  if (installed) return
  installed = true
  const currentGeneration = ++generation
  let host: ElectronNetworkHost | undefined
  const sessions = new Map<string, Promise<RouteSession>>()
  const configs = new Map<string, ProxyConfig>()
  const adapter = createAdaptiveAiFetch({
    onSelected: (route, origin) => {
      const config = configs.get(route.id)
      if (config && generation === currentGeneration) selectedConfigs.set(origin, config)
    },
    onStatus: (next) => {
      if (generation === currentGeneration) status = next
    },
    routes: async () => {
      host ??= electronHost()
      await host.app.whenReady()
      const getRoute = async (id: string, proxy?: string): Promise<AiRoute> => {
        configs.set(
          id,
          proxy
            ? { mode: 'fixed_servers', proxyRules: proxy }
            : { mode: id === 'system' ? 'system' : 'direct' },
        )
        const key = proxy ?? id
        let pending = sessions.get(key)
        if (!pending) {
          const ses = host!.session.fromPartition(
            `genoffice-ai-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`,
            { cache: false },
          )
          pending = ses
            .setProxy(
              proxy
                ? { mode: 'fixed_servers', proxyRules: proxy }
                : { mode: id === 'system' ? 'system' : 'direct' },
            )
            .then(() => ses)
          sessions.set(key, pending)
          pending.catch(() => sessions.delete(key))
        }
        const ses = await pending
        return {
          id,
          fetch: async (input, init) => {
            if (input instanceof Request) {
              const request = new Request(input, init)
              return ses.fetch(request.url, {
                method: request.method,
                headers: request.headers,
                ...(!['GET', 'HEAD'].includes(request.method)
                  ? { body: await request.arrayBuffer() }
                  : {}),
                signal: request.signal,
                redirect: request.redirect,
              })
            }
            return ses.fetch(String(input), init)
          },
        }
      }
      const settings = await getAiNetworkPreferences()
      if (settings.mode === 'system') return [await getRoute('system')]
      if (settings.mode === 'direct') return [await getRoute('direct')]
      if (settings.mode === 'manual') return [await getRoute('manual-proxy', settings.proxyUrl!)]
      const routes: AiRoute[] = [await getRoute('system'), await getRoute('direct')]
      const seen = new Set<string>()
      for (const key of [
        'HTTPS_PROXY',
        'https_proxy',
        'HTTP_PROXY',
        'http_proxy',
        'ALL_PROXY',
        'all_proxy',
      ]) {
        try {
          const url = new URL(process.env[key] ?? '')
          // Chromium proxy authentication needs a login flow; never leak credentials
          // into partition names, command arguments, status or logs.
          if (
            !['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) ||
            url.username ||
            url.password
          )
            continue
          const proxy = `${url.protocol === 'socks5h:' ? 'socks5:' : url.protocol}//${url.host}`
          if (seen.has(proxy)) continue
          seen.add(proxy)
          routes.push(await getRoute(`environment-proxy-${seen.size}`, proxy))
        } catch {
          /* No valid proxy in this variable. */
        }
      }
      const ports = [7890, 7891, 7897, 1080, 1086, 1087, 10808, 10809, 8080, 8888]
      const opened = await Promise.all(ports.map(listening))
      for (let index = 0; index < ports.length; index++) {
        if (!opened[index]) continue
        for (const scheme of ['http', 'socks5']) {
          const proxy = `${scheme}://127.0.0.1:${ports[index]}`
          if (!seen.has(proxy)) {
            seen.add(proxy)
            routes.push(await getRoute(`local-proxy-${index}-${scheme}`, proxy))
          }
        }
      }
      return routes
    },
  })
  setAiFetch(adapter)
}
