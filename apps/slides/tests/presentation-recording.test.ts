import { describe, expect, it } from 'vitest'
import {
  PRESENTATION_MP4_TYPES,
  presentationMp4Mime,
  recordingFileName,
} from '../src/renderer/presentation-recording'

describe('presentation recording', () => {
  it('prefers explicit H.264/AAC MP4 and never falls back to WebM', () => {
    expect(presentationMp4Mime((mime) => mime === PRESENTATION_MP4_TYPES[0])).toBe(
      PRESENTATION_MP4_TYPES[0],
    )
    expect(presentationMp4Mime((mime) => mime === 'video/mp4')).toBe('video/mp4')
    expect(presentationMp4Mime((mime) => mime.startsWith('video/webm'))).toBeNull()
  })

  it('builds a portable MP4 name from a deck path', () => {
    const now = new Date('2026-08-14T12:34:56.789Z')
    expect(recordingFileName('/work/课程.pptx', now)).toBe('课程-recording-2026-08-14T12-34-56.mp4')
    expect(recordingFileName(null, now)).toBe('Presentation-recording-2026-08-14T12-34-56.mp4')
  })
})
