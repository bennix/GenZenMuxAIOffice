export const PRESENTATION_MP4_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
] as const

/** Pick a real MP4 MediaRecorder format. A WebM blob renamed to .mp4 is never accepted. */
export function presentationMp4Mime(
  isTypeSupported: (mime: string) => boolean = MediaRecorder.isTypeSupported.bind(MediaRecorder),
): string | null {
  return PRESENTATION_MP4_TYPES.find((mime) => isTypeSupported(mime)) ?? null
}

export function recordingFileName(deckPath: string | null, now = new Date()): string {
  const deck = (deckPath?.split(/[\\/]/).pop() ?? 'Presentation').replace(/\.pptx?$/i, '')
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${deck || 'Presentation'}-recording-${stamp}.mp4`
}
