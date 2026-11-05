import { describe, expect, it, vi } from 'vitest'
import { createAdaptiveAiFetch, type AiRoute } from '../src/network'

const target = 'https://ai.example/v1/chat/completions?key=private'
function route(
  id: string,
  actual: () => Promise<Response> = async () => new Response('done'),
): AiRoute {
  return {
    id,
    fetch: vi.fn(async (_input, init) =>
      init?.method === 'GET' ? new Response('', { status: 401 }) : actual(),
    ) as typeof fetch,
  }
}
describe('adaptive AI transport', () => {
  it('probes without secrets, shares concurrent selection and sends the real headers only once per request', async () => {
    const system = route('system')
    const routes = vi.fn(async () => [system])
    const fetch = createAdaptiveAiFetch({ routes })
    await Promise.all([
      fetch(target, {
        method: 'POST',
        headers: { Authorization: 'Bearer private' },
        body: 'prompt',
      }),
      fetch(target, { method: 'POST', body: 'another' }),
    ])
    expect(routes).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(system.fetch).mock.calls
    expect(calls[0]![0]).toBe('https://ai.example/v1/chat/completions')
    expect(calls[0]![1]?.headers).toEqual({ Accept: 'application/json' })
    expect(calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(2)
  })
  it('falls back from an unreachable system route and re-detects after network TTL', async () => {
    let clock = 0
    const system: AiRoute = { id: 'system', fetch: vi.fn().mockRejectedValue(new Error('offline')) }
    const direct = route('direct')
    const routes = vi.fn(async () => [system, direct])
    const fetch = createAdaptiveAiFetch({ routes, now: () => clock, ttlMs: 100 })
    expect(await (await fetch(target, { method: 'POST' })).text()).toBe('done')
    clock = 101
    await fetch(target, { method: 'POST' })
    expect(routes).toHaveBeenCalledTimes(2)
  })
  it('does not replay a billable POST and avoids the failed route on the next request', async () => {
    const system = route('system', async () => {
      throw new Error('connection reset')
    })
    const direct = route('direct')
    const fetch = createAdaptiveAiFetch({ routes: async () => [system, direct] })
    await expect(fetch(target, { method: 'POST' })).rejects.toThrow('connection reset')
    expect(
      vi.mocked(direct.fetch).mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(0)
    expect(await (await fetch(target, { method: 'POST' })).text()).toBe('done')
  })
  it('invalidates streams that fail while reading, not just failed response headers', async () => {
    const broken = route(
      'system',
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error('truncated stream'))
            },
          }),
        ),
    )
    const fetch = createAdaptiveAiFetch({ routes: async () => [broken, route('direct')] })
    await expect((await fetch(target, { method: 'POST' })).text()).rejects.toThrow(
      'truncated stream',
    )
    expect(await (await fetch(target, { method: 'POST' })).text()).toBe('done')
  })
  it('does not send a real request when every route fails its probe', async () => {
    const blocked: AiRoute = {
      id: 'system',
      fetch: vi.fn(async () => new Response('', { status: 407 })) as typeof fetch,
    }
    const fetch = createAdaptiveAiFetch({ routes: async () => [blocked] })
    await expect(fetch(target, { method: 'POST' })).rejects.toThrow('AI network unavailable')
    expect(blocked.fetch).toHaveBeenCalledTimes(1)
  })
  it('does not mark consumer cancellation as a disconnected route', async () => {
    const onStatus = vi.fn()
    const routes = vi.fn(async () => [
      route(
        'system',
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([1]))
              },
            }),
          ),
      ),
    ])
    const fetch = createAdaptiveAiFetch({ routes, onStatus })
    const response = await fetch(target, { method: 'POST' })
    await response.body!.cancel()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onStatus.mock.calls.some(([status]) => status.state === 'disconnected')).toBe(false)
    const next = await fetch(target, { method: 'POST' })
    await next.body!.cancel()
    expect(routes).toHaveBeenCalledTimes(1)
  })

  it('respects cancellation before detection', async () => {
    const routes = vi.fn(async () => [route('system')])
    const fetch = createAdaptiveAiFetch({ routes })
    await expect(fetch(target, { method: 'POST', signal: AbortSignal.abort() })).rejects.toThrow()
    expect(routes).not.toHaveBeenCalled()
  })
})
