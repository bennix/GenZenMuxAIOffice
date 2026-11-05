export interface AiNetworkBridge {
  fetch(request: {
    id: string
    url: string
    method: string
    headers: [string, string][]
    body?: Uint8Array
  }): Promise<{ status: number; statusText: string; headers: [string, string][]; body: Uint8Array }>
  cancel(id: string): void
  fetchAsset?(url: string): Promise<{ base64: string; mime: string }>
}

/** Desktop uses the same automatic routing as document/slides AI; Web uses browser networking. */
export const aiServiceFetch: typeof fetch = async (input, init) => {
  const local = globalThis as typeof globalThis & { aiNetwork?: AiNetworkBridge }
  const bridge =
    local.aiNetwork ??
    (typeof window !== 'undefined' && window.parent !== window
      ? (window.parent as Window & { aiNetwork?: AiNetworkBridge }).aiNetwork
      : undefined)
  if (!bridge) return globalThis.fetch(input, init)
  const request = new Request(input, init)
  request.signal.throwIfAborted()
  const id = crypto.randomUUID()
  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : new Uint8Array(await request.arrayBuffer())
  request.signal.throwIfAborted()
  const abort = () => bridge.cancel(id)
  // invoke before registering cancellation so the main handler sees the request first.
  const pending = bridge.fetch({
    id,
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body,
  })
  request.signal.addEventListener('abort', abort, { once: true })
  try {
    if (request.signal.aborted) abort()
    const response = await pending
    request.signal.throwIfAborted()
    return new Response(
      request.method === 'HEAD' || [204, 205, 304].includes(response.status)
        ? null
        : new Uint8Array(response.body),
      response,
    )
  } finally {
    request.signal.removeEventListener('abort', abort)
  }
}
