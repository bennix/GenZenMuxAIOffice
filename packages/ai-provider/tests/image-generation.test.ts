import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateZenMuxImage } from '../src/images'
import { jsonResponse } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

describe('generateZenMuxImage', () => {
  it('uses generateContent for Gemini image models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          { content: { parts: [{ inlineData: { data: 'abc', mimeType: 'image/png' } }] } },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateZenMuxImage({
        apiKey: 'key',
        model: 'google/gemini-3.1-flash-image',
        prompt: 'deck cover',
        aspectRatio: '16:9',
      }),
    ).resolves.toEqual({ base64: 'abc', mime: 'image/png' })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://zenmux.ai/api/vertex-ai/v1/publishers/google/models/gemini-3.1-flash-image:generateContent',
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.generationConfig).toMatchObject({
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
    })
  })

  it('uses Vertex predict for non-Google models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ predictions: [{ bytesBase64Encoded: 'xyz', mimeType: 'image/jpeg' }] }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateZenMuxImage({
        apiKey: 'key',
        model: 'openai/gpt-image-2',
        prompt: 'editorial illustration',
        aspectRatio: '3:2',
      }),
    ).resolves.toEqual({ base64: 'xyz', mime: 'image/jpeg' })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://zenmux.ai/api/vertex-ai/v1/publishers/openai/models/gpt-image-2:predict',
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.parameters).toMatchObject({ imageSize: '1536x1024', quality: 'high' })
  })

  it('uses ZenMux native high-fidelity image editing for a local gpt-image-2 reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ b64_json: 'clean' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await generateZenMuxImage({
      apiKey: 'key',
      model: 'openai/gpt-image-2',
      prompt: 'restore scan',
      referenceImages: [{ base64: 'c2Nhbg==', mime: 'image/png' }],
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://zenmux.ai/api/v1/images/edits')
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('model')).toBe('openai/gpt-image-2')
    expect(body.get('prompt')).toBe('restore scan')
    expect(body.get('input_fidelity')).toBe('high')
    expect(body.get('quality')).toBe('high')
    expect(body.get('size')).toBe('auto')
    expect(body.get('image')).toBeInstanceOf(Blob)
  })
})
