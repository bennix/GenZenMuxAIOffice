import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { ToolRegistry, ToolResult } from './registry'

/** Explicit opt-in local bridge. Never accepts browser-origin requests. */
export async function startApplicationBridge(registry: ToolRegistry, token: string, port = 0) {
  if (token.length < 32) throw new Error('MCP token must contain at least 32 characters')
  const expected = Buffer.from(`Bearer ${token}`)
  const server = createServer(async (request, response) => {
    const auth = Buffer.from(request.headers.authorization ?? '')
    if (
      request.headers.origin ||
      auth.length !== expected.length ||
      !timingSafeEqual(auth, expected)
    ) {
      response.writeHead(403).end()
      return
    }
    if (request.method !== 'POST' || request.url !== '/call') {
      response.writeHead(404).end()
      return
    }
    const controller = new AbortController()
    response.on('close', () => controller.abort())
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 1024 * 1024) {
          response.writeHead(413).end()
          return
        }
        chunks.push(Buffer.from(chunk))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || typeof body.name !== 'string') {
        response.writeHead(400).end()
        return
      }
      const result = await registry.call(body.name, body.arguments ?? {}, {
        signal: controller.signal,
      })
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch {
      if (!response.headersSent) response.writeHead(400).end()
    }
  })
  server.requestTimeout = 30_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing MCP bridge address')
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  }
}

export function applicationBridgeClient(port: number, token: string) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || token.length < 32)
    throw new Error('Invalid MCP bridge configuration')
  return async (
    name: string,
    args: unknown,
    signal?: AbortSignal,
    timeoutMs = 30_000,
  ): Promise<unknown> => {
    const response = await fetch(`http://127.0.0.1:${port}/call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`ZenOffice bridge returned HTTP ${response.status}`)
    const result = (await response.json()) as ToolResult
    const value = JSON.parse(result.content[0]!.text)
    if (result.isError) throw new Error(value.message ?? 'ZenOffice operation failed')
    return value
  }
}
