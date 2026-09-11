import { normalizeVideoOptions, videoCapabilities, type VideoSettings } from './videoModels'
// ZenMux client — OpenAI-compatible REST. See REQUIREMENTS.md §4.
// ⚠️ Endpoint shapes target the OpenAI contract; verify against ZenMux live docs and
// adjust the request/response mapping here (kept isolated for that reason).
import { ZENMUX_BASE_URL, ZENMUX_VERTEX_BASE_URL, useSettings } from '../store/settingsStore'

function authHeaders(): HeadersInit {
  const key = useSettings.getState().apiKey
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
}

// Vertex AI calls accept the key as a Bearer token; x-goog-api-key is sent too as a
// harmless fallback in case the proxy expects the Gemini-style header.
function vertexHeaders(): HeadersInit {
  const key = useSettings.getState().apiKey
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'x-goog-api-key': key,
  }
}

// ---- Key validation ---------------------------------------------------------
// Auth check via a minimal POST. NOTE: ZenMux's CORS policy only allows POST/OPTIONS
// from the browser (GET /models is blocked → "Failed to fetch"), so we validate with a
// 1-token chat completion. Any non-401/403 response means the key authenticated (a 400
// bad-model or 402 no-balance still proves auth passed); only 401/403 means invalid.
export async function testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  if (!key.trim()) return { ok: false, message: 'No key provided' }
  const model = useSettings.getState().defaultModel('chat')?.id ?? 'google/gemini-3.1-pro-preview'
  try {
    const res = await fetch(`${ZENMUX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
    })
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: 'Invalid or unauthorized key' }
    if (res.ok) return { ok: true, message: 'Key is valid' }
    if (res.status === 402) return { ok: true, message: 'Key valid, but no balance/credits' }
    // Other statuses (e.g. 400 bad model, 429 rate limit) still mean auth succeeded.
    return { ok: true, message: `Key authenticated (server returned ${res.status})` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Network error' }
  }
}

// ---- Chat / orchestrator ----------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ChatResponse {
  message: ChatMessage
  finishReason: string
}

export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  options?: { signal?: AbortSignal },
): Promise<ChatResponse> {
  const res = await fetch(`${ZENMUX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(),
    signal: options?.signal,
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  })
  if (!res.ok) throw new Error(`Chat failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  const choice = data.choices?.[0]
  return { message: choice.message, finishReason: choice.finish_reason }
}

// ---- Image ------------------------------------------------------------------
// Confirmed via ZenMux docs: POST /images/generations is the OpenAI Images API and is
// supported for OpenAI image models (gpt-image-2). It returns base64 (`b64_json`) by default.
// NOTE: Google (gemini-*-image) and Doubao image models use ZenMux's Vertex AI protocol
// (base https://zenmux.ai/api/vertex-ai), NOT this endpoint. Keep gpt-image-2 as the default
// image model, or extend this client with a Vertex path before switching defaults.

export async function generateImage(
  model: string,
  prompt: string,
  size = '1024x1024',
  n = 1,
): Promise<string[]> {
  const res = await fetch(`${ZENMUX_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model, prompt, size, n, output_format: 'png' }),
  })
  if (!res.ok) throw new Error(`Image failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  // Response: { data: [{ b64_json }] } by default; some models may return url.
  return (data.data ?? []).map((d: { url?: string; b64_json?: string }) =>
    d.url ? d.url : `data:image/png;base64,${d.b64_json}`,
  )
}

// ---- Image edit / inpaint / reference-to-image ------------------------------
// POST /v1/images/edits (multipart). Covers: edit whole image (image + prompt),
// brush inpaint (image + mask, where transparent mask pixels are the editable region),
// and reference→image (one or more input images + prompt). gpt-image models only.
export async function editImages(
  images: Blob[],
  prompt: string,
  opts: { mask?: Blob; model: string; n?: number; size?: string },
): Promise<string[]> {
  const key = useSettings.getState().apiKey
  const fd = new FormData()
  fd.append('model', opts.model)
  fd.append('prompt', prompt)
  if (images.length === 1) fd.append('image', images[0], 'image.png')
  else images.forEach((b, i) => fd.append('image[]', b, `image-${i}.png`))
  if (opts.mask) fd.append('mask', opts.mask, 'mask.png')
  if (opts.n) fd.append('n', String(opts.n))
  fd.append('size', opts.size ?? '1024x1024')

  // Do not set Content-Type — the browser adds the multipart boundary.
  const res = await fetch(`${ZENMUX_BASE_URL}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })
  if (!res.ok) throw new Error(`Edit failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return (data.data ?? []).map((d: { url?: string; b64_json?: string }) =>
    d.url ? d.url : `data:image/png;base64,${d.b64_json}`,
  )
}

// ---- Video (Vertex AI protocol; async submit + poll) ------------------------
// ZenMux serves video via its Vertex AI–compatible base. This mirrors the documented
// google-genai Vertex flow as raw REST: :predictLongRunning to submit, then
// :fetchPredictOperation to poll the long-running operation until `done`.
//
// Model-specific protocol and controls come from the dated ZenMux catalog snapshot.

const POLL_INTERVAL_MS = 15000 // docs recommend ~15s
const MAX_POLLS = 40 // ~10 min ceiling

// Map a "provider/model-name" id to ZenMux's Vertex path. Confirmed against the live API:
// e.g. bytedance/doubao-seedance-2.0 → publishers/bytedance/models/doubao-seedance-2.0.
function videoModelPath(model: string): string {
  const slash = model.indexOf('/')
  const provider = slash > 0 ? model.slice(0, slash) : 'google'
  const name = slash > 0 ? model.slice(slash + 1) : model
  return `${ZENMUX_VERTEX_BASE_URL}/v1/publishers/${provider}/models/${name}`
}

// Deep-search the operation response for a playable video, regardless of exact nesting.
// Providers differ (videos[], generatedSamples[], predictions[], nested {video:{...}}), so
// rather than hardcode one path we walk the object for base64 mp4 bytes or a video URL.
function extractVideoUrl(response: unknown): string | null {
  let found: string | null = null
  const seen = new Set<unknown>()
  const walk = (node: unknown, mime?: string) => {
    if (found || node == null || typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)
    const obj = node as Record<string, unknown>
    const m = (typeof obj.mimeType === 'string' ? obj.mimeType : undefined) ?? mime
    if (m?.startsWith('image/') || obj.type === 'image' || obj.type === 'image_url') return
    const b64 = obj.bytesBase64Encoded ?? obj.b64_json ?? obj.videoBytes
    if (typeof b64 === 'string' && b64.length > 0) {
      found = `data:${m ?? 'video/mp4'};base64,${b64}`
      return
    }
    for (const key of ['video_url', 'gcsUri', 'uri', 'url', 'videoUri', 'downloadUri']) {
      const val = obj[key]
      if (typeof val === 'string' && /^https?:\/\//.test(val)) {
        found = val
        return
      }
    }
    for (const v of Object.values(obj)) walk(v, m)
  }
  walk(response)
  return found
}

// Compact shape (keys + array lengths, base64 masked) for diagnostic error messages.
function summarizeShape(node: unknown, depth = 0): string {
  if (node == null) return String(node)
  if (Array.isArray(node))
    return `[${node.length}]${node[0] != null && depth < 3 ? summarizeShape(node[0], depth + 1) : ''}`
  if (typeof node === 'object') {
    return `{${Object.keys(node as object)
      .slice(0, 12)
      .join(',')}}`
  }
  if (typeof node === 'string')
    return node.length > 40 ? `<str ${node.length}>` : JSON.stringify(node)
  return String(node)
}

export async function generateVideo(
  model: string,
  prompt: string,
  opts: VideoSettings & {
    image?: { base64: string; mimeType: string }
    images?: { base64: string; mimeType: string }[]
    aspect?: string
    duration?: number
  } = {},
): Promise<string> {
  const base = videoModelPath(model)

  const images = opts.images ?? (opts.image ? [opts.image] : [])
  const mode = opts.videoMode ?? 'firstLastFrame'
  const caps = videoCapabilities(model, mode, images.length)
  if (!caps.modes.includes(mode))
    throw new Error('This model does not support the selected video mode')
  if (
    images.length >
    (mode === 'firstLastFrame' ? (caps.supportsLastFrame ? 2 : 1) : caps.maxReferences)
  )
    throw new Error('Too many reference images for this model/mode')
  const normalized = normalizeVideoOptions(model, opts, images.length)
  if (caps.protocol === 'videos') {
    const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }]
    images.forEach((im, i) =>
      content.push({
        type: 'image_url',
        role:
          mode === 'referenceGeneration'
            ? 'reference_image'
            : i === 0
              ? 'first_frame'
              : 'last_frame',
        image_url: { url: `data:${im.mimeType};base64,${im.base64}` },
      }),
    )
    const submit = await fetch(`${ZENMUX_BASE_URL}/videos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        content,
        ratio: normalized.aspect,
        duration: normalized.duration,
        resolution: normalized.resolution,
        generate_audio: normalized.generateAudio,
      }),
    })
    if (!submit.ok)
      throw new Error(`Video submit failed (${submit.status}): ${await submit.text()}`)
    const job = await submit.json()
    if (!job.id) throw new Error('Video submit returned no job id')
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const poll = await fetch(`${ZENMUX_BASE_URL}/videos/${encodeURIComponent(job.id)}`, {
        headers: authHeaders(),
      })
      if (!poll.ok) {
        if (poll.status === 429 || poll.status >= 500) continue
        throw new Error(`Video poll failed (${poll.status}): ${await poll.text()}`)
      }
      const status = await poll.json()
      if (['failed', 'cancelled', 'expired'].includes(status.status))
        throw new Error(`Video generation failed: ${status.error?.message ?? status.status}`)
      if (status.status !== 'succeeded') continue
      const url = extractVideoUrl(status.content)
      if (url) return url
      throw new Error('Completed but no video found')
    }
    throw new Error('Video generation timed out')
  }
  const toImage = (im: { base64: string; mimeType: string }) => ({
    bytesBase64Encoded: im.base64,
    mimeType: im.mimeType,
  })
  const instance: Record<string, unknown> = { prompt }
  if (mode === 'referenceGeneration' && images.length) {
    instance.referenceImages = images.map((im) => ({ image: toImage(im), referenceType: 'asset' }))
  } else {
    if (images[0]) instance.image = toImage(images[0])
    if (images[1]) instance.lastFrame = toImage(images[1])
  }
  const parameters: Record<string, unknown> = {
    sampleCount: 1,
    aspectRatio: normalized.aspect,
    durationSeconds: normalized.duration,
  }
  if (normalized.resolution) parameters.resolution = normalized.resolution
  if (normalized.generateAudio !== undefined) parameters.generateAudio = normalized.generateAudio

  // 1) Submit. No storageUri → response carries base64 bytes rather than a GCS URI.
  const submit = await fetch(`${base}:predictLongRunning`, {
    method: 'POST',
    headers: vertexHeaders(),
    body: JSON.stringify({ instances: [instance], parameters }),
  })
  if (!submit.ok) throw new Error(`Video submit failed (${submit.status}): ${await submit.text()}`)
  const op = await submit.json()
  const operationName: string | undefined = op.name
  if (!operationName) throw new Error('Video submit returned no operation name')

  // 2) Poll the operation until done.
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const poll = await fetch(`${base}:fetchPredictOperation`, {
      method: 'POST',
      headers: vertexHeaders(),
      body: JSON.stringify({ operationName }),
    })
    if (!poll.ok) {
      if (poll.status === 429 || poll.status >= 500) continue
      throw new Error(`Video poll failed (${poll.status}): ${await poll.text()}`)
    }
    const status = await poll.json()
    if (!status.done) continue
    if (status.error)
      throw new Error(`Video generation failed: ${status.error.message ?? 'unknown'}`)
    // Search the entire status (some providers omit the `response` wrapper).
    const url = extractVideoUrl(status.response ?? status)
    if (url) return url
    // Gateways also put provider validation failures in the RAI fields.
    const filtered = status.response?.raiMediaFilteredCount
    if (filtered) {
      const reasons = status.response?.raiMediaFilteredReasons
      const detail = reasons ? JSON.stringify(reasons) : ''
      if (/parameter\s+ratio|output ratio follows the first-frame/i.test(detail)) {
        throw new Error(
          `视频比例参数无效：首帧或首尾帧生成必须跟随首帧比例（adaptive）。请重新提交。上游详情：${detail}`,
        )
      }
      throw new Error(
        `Video generation returned no usable output${detail ? `: ${detail}` : ` (${filtered} filtered)`}`,
      )
    }
    throw new Error(
      `Completed but no video found. Response keys: ${summarizeShape(status.response ?? status)}`,
    )
  }
  throw new Error('Video generation timed out')
}
