import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateVideo } from './zenmux'

describe('generateVideo duration normalization', () => {
  it('reports upstream ratio validation from RAI fields without calling it content filtering', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'op' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            done: true,
            response: {
              raiMediaFilteredCount: 1,
              raiMediaFilteredReasons: [
                'The parameter ratio specified in the request is not valid. The output ratio follows the first-frame image. Request id: test-id',
              ],
            },
          }),
        }),
    )
    const result = generateVideo('bytedance/doubao-seedance-2.5', 'move', {
      image: { base64: 'first', mimeType: 'image/png' },
    }).catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await result).toContain('adaptive')
    expect(await result).toContain('test-id')
    expect(await result).not.toContain('blocked by content filter')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('submits native Wan long video and extracts content.video_url rather than the last frame', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'succeeded',
          content: {
            last_frame_url: 'https://example.com/frame.jpg',
            video_url: 'https://example.com/result.mp4',
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const promise = generateVideo('alibaba/wan3.0-video', 'move', {
      aspect: '4:3',
      duration: 30,
      resolution: '1080p',
      generateAudio: false,
      videoMode: 'firstLastFrame',
      images: [
        { base64: 'first', mimeType: 'image/png' },
        { base64: 'last', mimeType: 'image/png' },
      ],
    })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(promise).resolves.toBe('https://example.com/result.mp4')
    expect(fetchMock.mock.calls[0][0]).toBe('https://zenmux.ai/api/v1/videos')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      ratio: '4:3',
      duration: 30,
      resolution: '1080p',
      generate_audio: false,
      content: [{ type: 'text' }, { role: 'first_frame' }, { role: 'last_frame' }],
    })
  })

  it('submits Seedance 2.5 settings and separate first/last frames through Vertex', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'op' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: { videos: [{ gcsUri: 'https://example.com/result.mp4' }] },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const promise = generateVideo('bytedance/doubao-seedance-2.5', 'move', {
      aspect: '21:9',
      duration: 30,
      resolution: '720p',
      generateAudio: false,
      images: [
        { base64: 'first', mimeType: 'image/png' },
        { base64: 'last', mimeType: 'image/png' },
      ],
    })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(promise).resolves.toBe('https://example.com/result.mp4')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      parameters: {
        aspectRatio: 'adaptive',
        durationSeconds: 30,
        resolution: '720p',
        generateAudio: false,
      },
      instances: [
        { image: { bytesBase64Encoded: 'first' }, lastFrame: { bytesBase64Encoded: 'last' } },
      ],
    })
  })

  it('rejects too many reference images without charging a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      generateVideo('google/veo-3.1-generate-001', 'move', {
        videoMode: 'referenceGeneration',
        images: Array(4).fill({ base64: 'image', mimeType: 'image/png' }),
      }),
    ).rejects.toThrow('Too many')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes unsupported Veo 3.1 durations before submitting image-to-video requests', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'publishers/google/models/veo-3.1-fast-generate-001/operations/op-1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: 'video-bytes', mimeType: 'video/mp4' }],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const promise = generateVideo('google/veo-3.1-fast-generate-001', 'make it move', {
      image: { base64: 'image-bytes', mimeType: 'image/png' },
      aspect: '16:9',
      duration: 5,
    })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(promise).resolves.toBe('data:video/mp4;base64,video-bytes')

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.parameters.durationSeconds).toBe(6)
  })

  it('defaults Veo 3.1 requests to a supported duration when none is provided', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'publishers/google/models/veo-3.1-generate-001/operations/op-1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          done: true,
          response: {
            videos: [{ bytesBase64Encoded: 'video-bytes', mimeType: 'video/mp4' }],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const promise = generateVideo('google/veo-3.1-generate-001', 'make it move', { aspect: '16:9' })
    await vi.advanceTimersByTimeAsync(15000)
    await expect(promise).resolves.toBe('data:video/mp4;base64,video-bytes')

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.parameters.durationSeconds).toBe(8)
  })
})
