import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiServiceFetch } from './network'

afterEach(() => vi.unstubAllGlobals())
describe('desktop AI network bridge', () => {
  it('uses the main-process route for authenticated POSTs exactly once', async () => {
    const send = vi.fn(async (_request: { body?: Uint8Array }) => ({
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/json']],
      body: new TextEncoder().encode('{"ok":true}'),
    }))
    vi.stubGlobal('aiNetwork', { fetch: send, cancel: vi.fn() })
    const response = await aiServiceFetch('https://zenmux.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: '{"prompt":"hello"}',
    })
    expect(await response.json()).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(new TextDecoder().decode(send.mock.calls[0]![0].body)).toBe('{"prompt":"hello"}')
  })
  it('does not send cancelled work', async () => {
    const send = vi.fn()
    vi.stubGlobal('aiNetwork', { fetch: send, cancel: vi.fn() })
    await expect(
      aiServiceFetch('https://zenmux.ai/api/v1/models', { signal: AbortSignal.abort() }),
    ).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
  it('keeps browser-only installations working without Electron', async () => {
    vi.stubGlobal('aiNetwork', undefined)
    const fetch = vi.fn(async () => new Response('web'))
    vi.stubGlobal('fetch', fetch)
    expect(await (await aiServiceFetch('https://zenmux.ai/api/v1/models')).text()).toBe('web')
  })
})

it('uses the parent Office bridge inside the asset studio iframe', async () => {
  const send = vi.fn(async () => ({
    status: 200,
    statusText: 'OK',
    headers: [],
    body: new TextEncoder().encode('parent'),
  }))
  vi.stubGlobal('aiNetwork', undefined)
  vi.stubGlobal('parent', { aiNetwork: { fetch: send, cancel: vi.fn() } })
  expect(await (await aiServiceFetch('https://zenmux.ai/api/v1/models')).text()).toBe('parent')
  expect(send).toHaveBeenCalledTimes(1)
})
