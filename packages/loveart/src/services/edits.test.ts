import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCanvas } from '../store/canvasStore'
import { buildVideoReferenceLayout, mergeRefsForVideo, referenceToVideo } from './edits'

describe('buildVideoReferenceLayout', () => {
  it('letterboxes a square reference into the requested 16:9 video frame', () => {
    const layout = buildVideoReferenceLayout([{ width: 1024, height: 1024 }], '16:9')

    expect(layout.canvas).toEqual({ width: 1280, height: 720 })
    expect(layout.items).toEqual([
      {
        source: { width: 1024, height: 1024 },
        x: 280,
        y: 0,
        width: 720,
        height: 720,
      },
    ])
  })

  it('keeps the full square reference inside a 9:16 video frame', () => {
    const layout = buildVideoReferenceLayout([{ width: 1024, height: 1024 }], '9:16')

    expect(layout.canvas).toEqual({ width: 720, height: 1280 })
    expect(layout.items).toEqual([
      {
        source: { width: 1024, height: 1024 },
        x: 0,
        y: 280,
        width: 720,
        height: 720,
      },
    ])
  })
})

describe('mergeRefsForVideo', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap
  const originalImage = globalThis.Image
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalToBlob = HTMLCanvasElement.prototype.toBlob

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.createImageBitmap = originalCreateImageBitmap
    globalThis.Image = originalImage
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    HTMLCanvasElement.prototype.getContext = originalGetContext
    HTMLCanvasElement.prototype.toBlob = originalToBlob
  })

  it('rasterizes SVG references before composing the video reference JPEG', async () => {
    const drawImage = vi.fn()
    const createImageBitmap = vi.fn(async () => ({
      width: 1280,
      height: 720,
      close: vi.fn(),
    })) as unknown as typeof globalThis.createImageBitmap

    globalThis.createImageBitmap = createImageBitmap
    URL.createObjectURL = vi.fn(() => 'blob:human-scene')
    URL.revokeObjectURL = vi.fn()
    globalThis.Image = class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 1280
      naturalHeight = 720
      width = 1280
      height = 720

      set src(_value: string) {
        this.onload?.()
      }
    } as unknown as typeof Image
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage,
      fillRect: vi.fn(),
      fillStyle: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob

    const merged = await mergeRefsForVideo(
      [new Blob(['<svg/>'], { type: 'image/svg+xml' })],
      '16:9',
    )

    expect(merged.type).toBe('image/jpeg')
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(HTMLCanvasElement))
    expect(drawImage).toHaveBeenCalled()
  })

  it('marks the video card failed and rethrows reference composition failures', async () => {
    const failure = new Error('decode failed')
    globalThis.createImageBitmap = vi.fn(async () => {
      throw failure
    }) as unknown as typeof globalThis.createImageBitmap
    useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })

    await expect(
      referenceToVideo(
        'project-1',
        'Animate the blocking',
        [new Blob(['bad'], { type: 'image/png' })],
        '16:9',
        5,
      ),
    ).rejects.toThrow('decode failed')

    expect(useCanvas.getState().cards).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        type: 'video',
        status: 'failed',
        error: 'decode failed',
      }),
    ])
  })
})
