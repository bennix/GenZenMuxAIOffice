import { describe, expect, it } from 'vitest'
import { MAX_CHAT_ATTACHMENTS, mergeAttachmentResult } from '../src/renderer/ai/attachment-state'
import type { AttachmentMeta } from '../src/shared/ipc'

function attachment(index: number, ext = 'txt'): AttachmentMeta {
  return { path: `/tmp/file-${index}.${ext}`, name: `file-${index}.${ext}`, ext, sizeBytes: 10 }
}

describe('PDF AI attachment state', () => {
  it('limits attachments to five and reports the limit', () => {
    const result = mergeAttachmentResult([], {
      accepted: Array.from({ length: 7 }, (_, index) => attachment(index)),
      rejected: [],
    })
    expect(result.items).toHaveLength(MAX_CHAT_ATTACHMENTS)
    expect(result.notice).toContain('5')
  })

  it('deduplicates paths while keeping image metadata for previews', () => {
    const image = attachment(1, 'png')
    const result = mergeAttachmentResult([image], {
      accepted: [image, attachment(2)],
      rejected: [],
    })
    expect(result.items).toEqual([image, attachment(2)])
    expect(result.notice).toBe('')
  })

  it('surfaces rejected attachment reasons', () => {
    const result = mergeAttachmentResult([], { accepted: [], rejected: ['too large'] })
    expect(result.notice).toBe('too large')
  })
})
