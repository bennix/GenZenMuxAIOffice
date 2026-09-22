import { describe, expect, it } from 'vitest'
import { normalizeVideoOptions, videoCapabilities, videoModels } from './videoModels'

describe('video model catalog', () => {
  it.each([1, 2])('locks Seedance 2.5 ratio to first frame with %s frames', (count) => {
    expect(
      normalizeVideoOptions('bytedance/doubao-seedance-2.5', { aspect: '21:9' }, count).aspect,
    ).toBe('adaptive')
    expect(
      videoCapabilities('bytedance/doubao-seedance-2.5', 'firstLastFrame', count).ratios,
    ).toEqual(['adaptive'])
    expect(
      normalizeVideoOptions(
        'bytedance/doubao-seedance-2.5',
        { aspect: '21:9', videoMode: 'referenceGeneration' },
        count,
      ).aspect,
    ).toBe('21:9')
  })
  it('exposes only models whose video transport is implemented', () => {
    expect(videoModels).toHaveLength(19)
    expect(
      videoModels.every((m) => m.protocols.includes('videos') || m.protocols.includes('veo')),
    ).toBe(true)
  })
  it('preserves Seedance 2.5 long duration and wide aspect, clamps stale resolution', () => {
    expect(
      normalizeVideoOptions('bytedance/doubao-seedance-2.5', {
        aspect: '21:9',
        duration: 30,
        resolution: '4k',
        generateAudio: false,
      }),
    ).toEqual({ aspect: '21:9', duration: 30, resolution: '480p', generateAudio: false })
  })
  it('enforces Veo reference duration and reference counts', () => {
    expect(
      videoCapabilities('google/veo-3.1-generate-001', 'referenceGeneration', 2),
    ).toMatchObject({ durations: [8], maxReferences: 3 })
    expect(
      videoCapabilities('sapiens-ai/agnes-video-v2.0', 'referenceGeneration', 2).maxReferences,
    ).toBe(2)
  })
  it('does not send unsupported audio toggles despite advertised audiovisual output', () => {
    expect(
      normalizeVideoOptions('minimax/minimax-h3', { generateAudio: true }).generateAudio,
    ).toBeUndefined()
  })
  it('keeps provider-specific resolution casing and maps smart to adaptive', () => {
    expect(normalizeVideoOptions('minimax/minimax-h3-max', { resolution: '768P' }).resolution).toBe(
      '768P',
    )
    expect(videoCapabilities('bytedance/doubao-seedance-2.5').ratios).toContain('adaptive')
  })
})
