import type { AiGeneratedImage, AiImageGenerateOptions } from './types'

const VERTEX_BASE_URL = 'https://zenmux.ai/api/vertex-ai/v1'
const OPENAI_BASE_URL = 'https://zenmux.ai/api/v1'

function modelPath(model: string): { provider: string; name: string } {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error('ZenMux image model must use provider/model-name format')
  }
  return { provider: model.slice(0, slash), name: model.slice(slash + 1) }
}

function openAiImageSize(aspectRatio?: string, requested?: string): string {
  if (requested && /^\d+x\d+$/.test(requested)) return requested
  if (aspectRatio === '16:9') return '1920x1088'
  if (aspectRatio === '3:2') return '1536x1024'
  if (aspectRatio === '9:16') return '1088x1920'
  if (aspectRatio === '2:3') return '1024x1536'
  return '1024x1024'
}

async function responseJson(response: Response): Promise<any> {
  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  if (!response.ok) {
    const detail = data?.error?.message ?? data?.message ?? text.slice(0, 500)
    throw new Error(`ZenMux image generation failed (${response.status}): ${detail}`)
  }
  return data
}

function generatedPart(data: any): AiGeneratedImage | null {
  for (const candidate of data?.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      const inline = part?.inlineData ?? part?.inline_data
      if (inline?.data)
        return { base64: inline.data, mime: inline.mimeType ?? inline.mime_type ?? 'image/png' }
    }
  }
  return null
}

function predictedImage(data: any): AiGeneratedImage | null {
  const prediction = data?.predictions?.[0]
  if (prediction?.bytesBase64Encoded) {
    return { base64: prediction.bytesBase64Encoded, mime: prediction.mimeType ?? 'image/png' }
  }
  if (prediction?.gcsUri)
    return { url: prediction.gcsUri, mime: prediction.mimeType ?? 'image/png' }
  return null
}

export async function generateZenMuxImage(
  options: AiImageGenerateOptions,
): Promise<AiGeneratedImage> {
  const { provider, name } = modelPath(options.model)
  const url = `${VERTEX_BASE_URL}/publishers/${encodeURIComponent(provider)}/models/${encodeURIComponent(name)}`
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
  }

  if (provider === 'google' && name.includes('image')) {
    const parts: any[] = [{ text: options.prompt }]
    for (const image of options.referenceImages ?? []) {
      parts.push({ inlineData: { data: image.base64, mimeType: image.mime } })
    }
    const response = await fetch(`${url}:generateContent`, {
      method: 'POST',
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: options.aspectRatio ?? '1:1',
            imageSize:
              options.imageSize && /^\dK$/i.test(options.imageSize) ? options.imageSize : '2K',
          },
        },
      }),
    })
    const image = generatedPart(await responseJson(response))
    if (!image) throw new Error('ZenMux returned no image data')
    return image
  }

  const instance: any = { prompt: options.prompt }
  const firstReference = options.referenceImages?.[0]
  // ZenMux exposes OpenAI's native multipart image-edit endpoint. Use it for
  // reference-based edits so input_fidelity=high is honored; sending the same
  // request through the generic Vertex predict adapter can be interpreted as a
  // fresh generation and invent unrelated page content.
  if (provider === 'openai' && firstReference) {
    const form = new FormData()
    form.append('model', options.model)
    form.append('prompt', options.prompt)
    form.append(
      'image',
      new Blob([Buffer.from(firstReference.base64, 'base64')], { type: firstReference.mime }),
      `reference.${firstReference.mime === 'image/jpeg' ? 'jpg' : firstReference.mime.split('/')[1] || 'png'}`,
    )
    form.append('input_fidelity', 'high')
    form.append('quality', 'high')
    form.append('size', 'auto')
    form.append('output_format', 'png')
    const response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.signal ? { signal: options.signal } : {}),
      body: form,
    })
    const data = await responseJson(response)
    const image = data?.data?.[0]
    if (image?.b64_json) return { base64: image.b64_json, mime: 'image/png' }
    if (image?.url) return { url: image.url, mime: 'image/png' }
    throw new Error('ZenMux returned no image data')
  }
  if (firstReference) {
    instance.image = {
      bytesBase64Encoded: firstReference.base64,
      mimeType: firstReference.mime,
    }
  }
  const parameters: any = {
    sampleCount: 1,
    aspectRatio: options.aspectRatio ?? '1:1',
    outputOptions: { mimeType: 'image/png' },
  }
  if (provider === 'openai') {
    parameters.imageSize = openAiImageSize(options.aspectRatio, options.imageSize)
    parameters.quality = 'high'
  } else if (options.imageSize && /^\dK$/i.test(options.imageSize)) {
    parameters.sampleImageSize = options.imageSize
  }
  const response = await fetch(`${url}:predict`, {
    method: 'POST',
    headers,
    ...(options.signal ? { signal: options.signal } : {}),
    body: JSON.stringify({ instances: [instance], parameters }),
  })
  const image = predictedImage(await responseJson(response))
  if (!image) throw new Error('ZenMux returned no image data')
  return image
}
