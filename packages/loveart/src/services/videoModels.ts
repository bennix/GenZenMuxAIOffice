import catalog from '../data/videoModels.json'

export type VideoMode = 'referenceGeneration' | 'firstLastFrame'
export interface VideoSettings {
  resolution?: string
  generateAudio?: boolean
  videoMode?: VideoMode
  model?: string
}
export const videoModels = catalog.models.filter((m) =>
  m.protocols.some((p) => p === 'veo' || p === 'videos'),
)
export function videoCapabilities(
  model: string,
  mode: VideoMode = 'firstLastFrame',
  referenceCount = 0,
) {
  const entry = videoModels.find((m) => m.id === model)
  const caps = entry?.capabilities
  const protocol = entry?.protocols.includes('veo') ? 'veo' : entry ? 'videos' : 'veo'
  const parameters = entry?.parameters[protocol as keyof typeof entry.parameters] as
    string[] | undefined
  let durations = caps?.durations ?? [4, 6, 8]
  let maxReferences = caps && 'maxReferenceImages' in caps ? caps.maxReferenceImages : undefined
  if (mode === 'referenceGeneration' && model.startsWith('google/veo-3.1')) {
    maxReferences = 3
    if (referenceCount > 0) durations = [8]
  }
  if (mode === 'referenceGeneration' && model === 'sapiens-ai/agnes-video-v2.0') maxReferences = 2
  // Seedance 2.5 rejects fixed ratios with first-frame/first-last-frame input.
  const followsFirstFrame =
    model === 'bytedance/doubao-seedance-2.5' && mode === 'firstLastFrame' && referenceCount > 0
  return {
    protocol,
    followsFirstFrame,
    ratios: followsFirstFrame
      ? ['adaptive']
      : (caps?.ratios.map((r) => (r.value === 'smart' ? 'adaptive' : r.value)) ?? ['16:9', '9:16']),
    resolutions: caps && 'resolutions' in caps ? (caps.resolutions?.map((r) => r.value) ?? []) : [],
    durations,
    supportsAudio: Boolean(
      caps &&
      'supportsAudio' in caps &&
      caps.supportsAudio &&
      parameters?.includes(protocol === 'veo' ? 'generateAudio' : 'generate_audio'),
    ),
    supportsLastFrame: protocol === 'videos' || Boolean(parameters?.includes('lastFrame')),
    modes: caps?.modes.map((m) => m.name as VideoMode) ?? (['firstLastFrame'] as VideoMode[]),
    maxReferences: maxReferences ?? 1,
  }
}

export function normalizeVideoOptions(
  model: string,
  options: VideoSettings & { aspect?: string; duration?: number },
  referenceCount = 0,
) {
  const caps = videoCapabilities(model, options.videoMode, referenceCount)
  const duration = Number.isFinite(options.duration) ? options.duration! : 8
  return {
    aspect: caps.ratios.includes(options.aspect ?? '')
      ? options.aspect!
      : caps.ratios.includes('16:9')
        ? '16:9'
        : caps.ratios[0],
    duration: caps.durations.reduce((best, d) =>
      Math.abs(d - duration) <= Math.abs(best - duration) ? d : best,
    ),
    resolution: caps.resolutions.includes(options.resolution ?? '')
      ? options.resolution
      : caps.resolutions[0],
    generateAudio: caps.supportsAudio ? (options.generateAudio ?? true) : undefined,
  }
}
