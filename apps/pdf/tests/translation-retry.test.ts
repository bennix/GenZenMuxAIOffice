// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { requestTranslationWithRetry } from '../src/main/translation-retry'

it('retries five times after the first network failure with bounded backoff', async () => {
  const request = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const wait = vi.fn().mockResolvedValue(undefined)
  const progress = vi.fn()
  await expect(
    requestTranslationWithRetry(request, new AbortController().signal, progress, wait),
  ).rejects.toThrow('fetch failed')
  expect(request).toHaveBeenCalledTimes(6)
  expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000])
  expect(progress).toHaveBeenLastCalledWith(expect.stringContaining('5/5'))
})
it('recovers from rate limits and transient server responses', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, error: 'HTTP 429: slow down' })
    .mockResolvedValueOnce({ ok: false, error: 'Claude HTTP 503: unavailable' })
    .mockResolvedValue({ ok: true, content: '译文' })
  const result = await requestTranslationWithRetry(
    request,
    new AbortController().signal,
    vi.fn(),
    vi.fn().mockResolvedValue(undefined),
  )
  expect(result.content).toBe('译文')
  expect(request).toHaveBeenCalledTimes(3)
})
it.each([401, 403, 400, 404])('does not retry HTTP %s', async (status) => {
  const request = vi.fn().mockResolvedValue({ ok: false, error: `HTTP ${status}: rejected` })
  const wait = vi.fn()
  await requestTranslationWithRetry(request, new AbortController().signal, vi.fn(), wait)
  expect(request).toHaveBeenCalledOnce()
  expect(wait).not.toHaveBeenCalled()
})
it('stops on cancellation during retry delay', async () => {
  const controller = new AbortController()
  const request = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  await expect(
    requestTranslationWithRetry(request, controller.signal, vi.fn(), async () => {
      controller.abort()
      controller.signal.throwIfAborted()
    }),
  ).rejects.toThrow()
  expect(request).toHaveBeenCalledOnce()
})
it('does not retry programming errors', async () => {
  const request = vi.fn().mockRejectedValue(new TypeError('Invalid request payload'))
  await expect(
    requestTranslationWithRetry(request, new AbortController().signal, vi.fn()),
  ).rejects.toThrow('Invalid request payload')
  expect(request).toHaveBeenCalledOnce()
})
