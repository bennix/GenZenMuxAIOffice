import { fetchWithSsrfGuard } from './safe-remote-url'
import type { App, IpcMain } from 'electron'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { aiFetch, type AiNetworkPreferences } from '@genoffice/ai-provider'
import {
  getAiNetworkStatus,
  installAdaptiveAiNetwork,
  getAiNetworkPreferences,
  setAiNetworkPreferences,
  resetAiNetwork,
} from './adaptive-ai-network'

let installed = false
/** Buffered bridge for LoveArt's non-streaming JSON/image/video-job API calls. */
export function registerAiNetworkIpc(): void {
  const { app, ipcMain } = createRequire(import.meta.url)('electron') as {
    app: App
    ipcMain: IpcMain
  }
  if (installed) return
  installed = true
  installAdaptiveAiNetwork()
  const active = new Map<string, AbortController>()
  const hosts = new Set([
    'zenmux.ai',
    'en.wikipedia.org',
    'zh.wikipedia.org',
    'openlibrary.org',
    'api.duckduckgo.com',
    'api.gdeltproject.org',
  ])
  ipcMain.handle('ai-network:asset', async (_event, url: string) => {
    const signal = AbortSignal.timeout(30000)
    const response = await fetchWithSsrfGuard(url, {
      fetchImpl: (input, init) => aiFetch(input, { ...init, signal }),
    })
    if (!response?.ok || !response.body) throw new Error('Asset download failed')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 64_000_000) {
        await reader.cancel()
        throw new Error('Asset exceeds 64 MB')
      }
      chunks.push(next.value)
    }
    const bytes = Buffer.concat(chunks)
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216
        ? 'image/jpeg'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : bytes.toString('ascii', 4, 8) === 'ftyp'
            ? 'video/mp4'
            : null
    if (!mime) throw new Error('Use PNG, JPEG, WebP or MP4 assets')
    return { base64: bytes.toString('base64'), mime }
  })
  ipcMain.handle('ai-network:status', () => getAiNetworkStatus())
  ipcMain.handle('ai-network:get-settings', async () => ({
    preferences: await getAiNetworkPreferences(),
    status: getAiNetworkStatus(),
  }))
  ipcMain.handle('ai-network:set-settings', async (_event, value: AiNetworkPreferences) => ({
    preferences: await setAiNetworkPreferences(value),
    status: getAiNetworkStatus(),
  }))
  ipcMain.handle('ai-network:check', async () => {
    resetAiNetwork()
    let baseUrl = 'https://zenmux.ai/api/v1'
    try {
      const stored = JSON.parse(
        await readFile(join(app.getPath('userData'), 'ai-settings.json'), 'utf8'),
      ) as { providers?: { zenmux?: { baseUrl?: string } } }
      if (stored.providers?.zenmux?.baseUrl) baseUrl = stored.providers.zenmux.baseUrl
    } catch {
      /* Default provider when no settings have been saved. */
    }
    try {
      const target = new URL(baseUrl)
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password)
        throw new Error('Invalid endpoint')
      target.pathname = target.pathname.replace(/\/$/, '') + '/models'
      target.search = ''
      target.hash = ''
      const response = await aiFetch(target, { signal: AbortSignal.timeout(12000) })
      await response.body?.cancel()
      return {
        ok: [200, 204, 401, 404, 405, 429].includes(response.status),
        httpStatus: response.status,
        status: getAiNetworkStatus(),
      }
    } catch {
      return { ok: false, status: getAiNetworkStatus() }
    }
  })

  ipcMain.on('ai-network:cancel', (event, id: string) =>
    active.get(`${event.sender.id}:${id}`)?.abort(),
  )
  ipcMain.handle(
    'ai-network:fetch',
    async (
      event,
      request: {
        id: string
        url: string
        method: string
        headers: [string, string][]
        body?: Uint8Array
      },
    ) => {
      const url = new URL(request.url)
      if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password)
        throw new Error('Unsupported AI service URL')
      if (
        !['GET', 'POST', 'HEAD'].includes(request.method) ||
        (request.body?.byteLength ?? 0) > 32_000_000
      )
        throw new Error('Invalid AI request')
      const key = `${event.sender.id}:${request.id}`
      if (active.has(key) || active.size >= 100) throw new Error('Too many active AI requests')
      const controller = new AbortController()
      active.set(key, controller)
      const destroyed = () => controller.abort()
      event.sender.once('destroyed', destroyed)
      try {
        const response = await aiFetch(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.body ? { body: Buffer.from(request.body) } : {}),
          redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
        })
        const chunks: Uint8Array[] = []
        let length = 0
        const reader = response.body?.getReader()
        if (reader) {
          for (;;) {
            const next = await reader.read()
            if (next.done) break
            length += next.value.byteLength
            if (length > 64_000_000) {
              await reader.cancel()
              throw new Error('AI response exceeds 64 MB')
            }
            chunks.push(next.value)
          }
        }
        const responseHeaders: [string, string][] = []
        response.headers.forEach((value, name) => responseHeaders.push([name, value]))
        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: Buffer.concat(chunks),
        }
      } finally {
        event.sender.removeListener('destroyed', destroyed)
        active.delete(key)
      }
    },
  )
}
