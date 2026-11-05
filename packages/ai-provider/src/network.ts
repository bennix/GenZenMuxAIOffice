/** One transport for all built-in AI calls. The desktop host installs its adapter. */
let configured: typeof fetch | undefined
export function setAiFetch(transport: typeof fetch): void {
  configured = transport
}
export function isAiFetchConfigured(): boolean {
  return configured !== undefined
}
export const aiFetch: typeof fetch = (input, init) => (configured ?? globalThis.fetch)(input, init)

export interface AiNetworkPreferences {
  mode: 'auto' | 'system' | 'direct' | 'manual'
  proxyUrl?: string
}

export interface AiRoute {
  id: string
  fetch: typeof fetch
}
export interface AiNetworkStatus {
  mode: string
  state: 'ready' | 'unavailable' | 'disconnected'
  checkedAt: number
}

/** Probes carry no authorization, cookies, query parameters or request body. */
export function createAdaptiveAiFetch(options: {
  routes: () => Promise<AiRoute[]>
  onStatus?: (status: AiNetworkStatus) => void
  onSelected?: (route: AiRoute, origin: string) => void
  now?: () => number
  ttlMs?: number
}): typeof fetch {
  const now = options.now ?? Date.now
  const cache = new Map<string, { route: AiRoute; until: number }>()
  const pending = new Map<string, Promise<AiRoute>>()
  const cooldowns = new Map<string, number>()
  async function select(url: URL): Promise<AiRoute> {
    const current = cache.get(url.origin)
    if (current && current.until > now()) return current.route
    const inFlight = pending.get(url.origin)
    if (inFlight) return inFlight
    const task = (async () => {
      const routes = (await options.routes()).filter(
        (route) => (cooldowns.get(url.origin + ':' + route.id) ?? 0) <= now(),
      )
      // Concurrent bounded probes; stable order honors system proxy before fallbacks.
      const results = await Promise.all(
        routes.map(async (route) => {
          try {
            const response = await route.fetch(url.origin + url.pathname, {
              method: 'GET',
              credentials: 'omit',
              redirect: 'error',
              signal: AbortSignal.timeout(3500),
              headers: { Accept: 'application/json' },
            })
            await response.body?.cancel()
            return [200, 204, 401, 404, 405, 429].includes(response.status)
          } catch {
            return false
          }
        }),
      )
      const route = routes.find((_, index) => results[index])
      if (!route) {
        options.onStatus?.({ mode: 'none', state: 'unavailable', checkedAt: now() })
        throw new Error(
          'AI network unavailable: system proxy, direct and local proxy routes failed. Check your network or proxy app, then retry.',
        )
      }
      options.onSelected?.(route, url.origin)
      cache.set(url.origin, { route, until: now() + (options.ttlMs ?? 30_000) })
      options.onStatus?.({ mode: route.id, state: 'ready', checkedAt: now() })
      return route
    })()
    pending.set(url.origin, task)
    try {
      return await task
    } finally {
      pending.delete(url.origin)
    }
  }
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('AI requests require HTTP or HTTPS.')
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    signal?.throwIfAborted()
    const route = await select(url)
    signal?.throwIfAborted()
    const invalidate = () => {
      if (cache.get(url.origin)?.route === route) cache.delete(url.origin)
      cooldowns.set(url.origin + ':' + route.id, now() + 30_000)
      options.onStatus?.({ mode: route.id, state: 'disconnected', checkedAt: now() })
    }
    try {
      // Never replay a potentially billable POST, even after a transport failure.
      const response = await route.fetch(input, init)
      if ([407, 502, 503, 504].includes(response.status)) invalidate()
      if (!response.body) return response
      const reader = response.body.getReader()
      let bodyCancelled = false
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read()
            if (bodyCancelled) return
            if (next.done) controller.close()
            else controller.enqueue(next.value)
          } catch (error) {
            if (bodyCancelled) return
            if (!signal?.aborted) invalidate()
            controller.error(error)
          }
        },
        cancel(reason) {
          bodyCancelled = true
          return reader.cancel(reason)
        },
      })
      const wrapped = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
      Object.defineProperty(wrapped, 'url', { value: response.url })
      return wrapped
    } catch (error) {
      if (!signal?.aborted) invalidate()
      throw error
    }
  }
}
