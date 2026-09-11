import type { VideoSettings } from './videoModels'
// Direct (non-agent) edit + reference-generation flows. Each creates placeholder cards
// on the canvas, calls ZenMux, then resolves the cards via the IndexedDB assetStore.
import { editImages, generateImage, generateVideo } from './zenmux'
import { optimizePromptForGenerationOrOriginal } from './agent'
import { getAsset, storeMedia } from './assetStore'
import { useSettings } from '../store/settingsStore'
import { useCanvas } from '../store/canvasStore'
import { useChat } from '../store/chatStore'
import type { Card } from '../types'

const IMG = { w: 320, h: 320 }
const VID = { w: 400, h: 240 }

interface SourceSize {
  width: number
  height: number
}

interface VideoReferenceLayoutItem {
  source: SourceSize
  x: number
  y: number
  width: number
  height: number
}

export interface VideoReferenceLayout {
  canvas: SourceSize
  items: VideoReferenceLayoutItem[]
}

// Image edits require an OpenAI gpt-image model. Prefer one from the registry, else default.
export function editModelId(): string {
  const models = useSettings.getState().models
  const selected = useSettings.getState().defaultModel('image')
  if (selected) return selected.id
  const gpt = models.find((m) => m.category === 'image' && m.id.includes('gpt-image'))
  return gpt?.id ?? 'openai/gpt-image-2'
}

// Resolve a card's pixels to a Blob: IndexedDB-backed blob, or fetch a remote URL.
export async function blobForCard(card: Card): Promise<Blob> {
  if (card.assetId) {
    const blob = await getAsset(card.assetId)
    if (blob) return blob
  }
  if (card.url) return await (await fetch(card.url)).blob()
  throw new Error('Card has no image data')
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  return dataUrl.split(',')[1] ?? ''
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable.')
  return ctx
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not encode video reference image.')),
      'image/jpeg',
      quality,
    )
  })
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode video reference image.'))
    }
    image.src = url
  })
}

async function imageBitmapForReference(ref: Blob): Promise<ImageBitmap> {
  if (ref.type !== 'image/svg+xml') return await createImageBitmap(ref)

  const image = await imageFromBlob(ref)
  const canvas = document.createElement('canvas')
  const width = Math.max(1, image.naturalWidth || image.width)
  const height = Math.max(1, image.naturalHeight || image.height)
  canvas.width = width
  canvas.height = height
  canvasContext(canvas).drawImage(image, 0, 0, width, height)
  return await createImageBitmap(canvas)
}

function fittedSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
  allowUpscale: boolean,
): { width: number; height: number } {
  const scale = Math.min(
    maxWidth / sourceWidth,
    maxHeight / sourceHeight,
    allowUpscale ? Infinity : 1,
  )
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

function videoReferenceCanvas(aspect?: string): SourceSize {
  if (aspect === '9:16') return { width: 720, height: 1280 }
  if (aspect === '1:1') return { width: 1024, height: 1024 }
  return { width: 1280, height: 720 }
}

export function buildVideoReferenceLayout(
  sources: SourceSize[],
  aspect?: string,
): VideoReferenceLayout {
  if (!sources.length) throw new Error('At least one video reference is required.')

  const canvas = videoReferenceCanvas(aspect)
  const columns = sources.length === 1 ? 1 : Math.ceil(Math.sqrt(sources.length))
  const rows = sources.length === 1 ? 1 : Math.ceil(sources.length / columns)
  const cellWidth = canvas.width / columns
  const cellHeight = canvas.height / rows
  const items = sources.map((source, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const size = fittedSize(source.width, source.height, cellWidth, cellHeight, true)
    const x = Math.round(column * cellWidth + (cellWidth - size.width) / 2)
    const y = Math.round(row * cellHeight + (cellHeight - size.height) / 2)
    return { source, x, y, width: size.width, height: size.height }
  })

  return { canvas, items }
}

export async function mergeRefsForVideo(
  refs: Blob[],
  aspect?: string,
  quality = 0.85,
): Promise<Blob> {
  if (!refs.length) throw new Error('At least one video reference is required.')

  const bitmaps: ImageBitmap[] = []
  try {
    for (const ref of refs) {
      bitmaps.push(await imageBitmapForReference(ref))
    }

    const canvas = document.createElement('canvas')
    const ctx = canvasContext(canvas)
    const layout = buildVideoReferenceLayout(
      bitmaps.map((bitmap) => ({ width: bitmap.width, height: bitmap.height })),
      aspect,
    )

    canvas.width = layout.canvas.width
    canvas.height = layout.canvas.height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    layout.items.forEach((item, index) => {
      ctx.drawImage(bitmaps[index], item.x, item.y, item.width, item.height)
    })

    return await canvasToJpeg(canvas, quality)
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close())
  }
}

function place(projectId: string, w: number, h: number) {
  return useCanvas.getState().nextSlot(projectId, w, h)
}

// Edit a source card (whole-image or masked inpaint) → new card on the canvas.
export async function editCard(
  projectId: string,
  source: Card,
  prompt: string,
  mask?: Blob,
): Promise<void> {
  const model = editModelId()
  useChat.getState().addMessage(projectId, 'user', `编辑图片：${prompt}`)
  const optimizedPrompt = await optimizePromptForGenerationOrOriginal(projectId, prompt)
  const slot = place(projectId, IMG.w, IMG.h)
  const id = useCanvas.getState().addCard({
    projectId,
    type: 'image',
    status: 'generating',
    prompt: optimizedPrompt,
    model,
    x: slot.x,
    y: slot.y,
    w: IMG.w,
    h: IMG.h,
  })
  try {
    const src = await blobForCard(source)
    const urls = await editImages([src], optimizedPrompt, { mask, model })
    const media = await storeMedia(urls[0])
    useCanvas.getState().updateCard(id, { status: 'ready', ...media })
  } catch (e) {
    useCanvas
      .getState()
      .updateCard(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
  }
}

// Plain text-to-image (no refs) → new image card(s). Used by the style-template picker
// for a deterministic, direct generation using the default image model.
export async function textToImage(
  projectId: string,
  prompt: string,
  n = 1,
  modelId?: string,
): Promise<void> {
  const model = modelId ? { id: modelId } : useSettings.getState().defaultModel('image')
  if (!model) return
  const ids = Array.from({ length: n }, () => {
    const slot = place(projectId, IMG.w, IMG.h)
    return useCanvas.getState().addCard({
      projectId,
      type: 'image',
      status: 'generating',
      prompt,
      model: model.id,
      x: slot.x,
      y: slot.y,
      w: IMG.w,
      h: IMG.h,
    })
  })
  try {
    const urls = await generateImage(model.id, prompt, '1024x1024', n)
    await Promise.all(
      ids.map(async (id, i) => {
        const media = await storeMedia(urls[i] ?? urls[0])
        useCanvas.getState().updateCard(id, { status: 'ready', ...media })
      }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ids.forEach((id) => useCanvas.getState().updateCard(id, { status: 'failed', error: msg }))
  }
}

// Reference image(s) + prompt → new image card(s).
export async function referenceToImage(
  projectId: string,
  prompt: string,
  refs: Blob[],
  n = 1,
  modelId?: string,
): Promise<void> {
  const model = modelId ?? editModelId()
  const ids = Array.from({ length: n }, () => {
    const slot = place(projectId, IMG.w, IMG.h)
    return useCanvas.getState().addCard({
      projectId,
      type: 'image',
      status: 'generating',
      prompt,
      model,
      x: slot.x,
      y: slot.y,
      w: IMG.w,
      h: IMG.h,
    })
  })
  try {
    const urls = await editImages(refs, prompt, { model, n })
    await Promise.all(
      ids.map(async (id, i) => {
        const media = await storeMedia(urls[i] ?? urls[0])
        useCanvas.getState().updateCard(id, { status: 'ready', ...media })
      }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ids.forEach((id) => useCanvas.getState().updateCard(id, { status: 'failed', error: msg }))
  }
}

// Reference image + prompt → video card (image-to-video).
export async function referenceToVideo(
  projectId: string,
  prompt: string,
  refs: Blob[],
  aspect?: string,
  duration?: number,
  settings?: VideoSettings,
): Promise<void> {
  const model = settings?.model ?? useSettings.getState().defaultModel('video')?.id
  if (!model) return
  const slot = place(projectId, VID.w, VID.h)
  const id = useCanvas.getState().addCard({
    projectId,
    type: 'video',
    status: 'generating',
    prompt,
    model,
    x: slot.x,
    y: slot.y,
    w: VID.w,
    h: VID.h,
  })
  try {
    let inputs: {
      image?: { base64: string; mimeType: string }
      images?: { base64: string; mimeType: string }[]
    }
    if (settings?.videoMode) {
      inputs = {
        images: await Promise.all(
          refs.map(async (blob) => ({
            base64: await blobToBase64(blob),
            mimeType: blob.type || 'image/jpeg',
          })),
        ),
      }
    } else {
      const merged = await mergeRefsForVideo(refs, aspect)
      inputs = {
        image: { base64: await blobToBase64(merged), mimeType: merged.type || 'image/jpeg' },
      }
    }
    const url = await generateVideo(model, prompt, { ...inputs, aspect, duration, ...settings })
    const media = await storeMedia(url)
    useCanvas.getState().updateCard(id, { status: 'ready', ...media })
  } catch (e) {
    useCanvas
      .getState()
      .updateCard(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

// Plain text-to-video (no ref) → video card.
export async function textToVideo(
  projectId: string,
  prompt: string,
  aspect?: string,
  duration?: number,
  settings?: VideoSettings,
): Promise<void> {
  const model = settings?.model ?? useSettings.getState().defaultModel('video')?.id
  if (!model) return
  const slot = place(projectId, VID.w, VID.h)
  const id = useCanvas.getState().addCard({
    projectId,
    type: 'video',
    status: 'generating',
    prompt,
    model,
    x: slot.x,
    y: slot.y,
    w: VID.w,
    h: VID.h,
  })
  try {
    const url = await generateVideo(model, prompt, { aspect, duration, ...settings })
    const media = await storeMedia(url)
    useCanvas.getState().updateCard(id, { status: 'ready', ...media })
  } catch (e) {
    useCanvas
      .getState()
      .updateCard(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
  }
}
