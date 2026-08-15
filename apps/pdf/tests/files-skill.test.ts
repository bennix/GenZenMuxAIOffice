import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFilesSkill } from '../src/renderer/ai/files-skill'
import type { AttachmentMeta, AttachmentReadResult } from '../src/shared/ipc'

const attachment: AttachmentMeta = {
  path: '/tmp/notes.md',
  name: 'notes.md',
  ext: 'md',
  sizeBytes: 2048,
}

function mockPdfApi(result: AttachmentReadResult) {
  const readAttachment = vi.fn(async () => result)
  vi.stubGlobal('window', { pdfApi: { readAttachment } })
  return readAttachment
}

afterEach(() => vi.unstubAllGlobals())

describe('PDF AI files skill', () => {
  it('adds the selected files to the per-turn context', () => {
    expect(createFilesSkill(() => [attachment]).buildContext?.()).toContain('notes.md')
    expect(createFilesSkill(() => []).buildContext?.()).toBe('')
  })

  it('reads text attachments locally in bounded slices', async () => {
    const readAttachment = mockPdfApi({
      ok: true,
      name: 'notes.md',
      totalChars: 50_000,
      offset: 10,
      text: 'hello',
    })
    const result = await createFilesSkill(() => [attachment]).executeTool({
      id: 'read',
      name: 'read_attachment',
      input: { index: 0, offset: 10 },
    })
    expect(readAttachment).toHaveBeenCalledWith('/tmp/notes.md', 10, 24_000)
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('10-15 of 50000')
  })

  it('does not attempt text extraction for multimodal images', async () => {
    const readAttachment = mockPdfApi({ ok: true })
    const result = await createFilesSkill(() => [
      { path: '/tmp/photo.png', name: 'photo.png', ext: 'png', sizeBytes: 1024 },
    ]).executeTool({ id: 'image', name: 'read_attachment', input: { index: 0 } })
    expect(result.output).toContain('multimodal')
    expect(readAttachment).not.toHaveBeenCalled()
  })

  it('rejects unknown indices without reading arbitrary paths', async () => {
    const readAttachment = mockPdfApi({ ok: true })
    const result = await createFilesSkill(() => [attachment]).executeTool({
      id: 'invalid',
      name: 'read_attachment',
      input: { index: 5 },
    })
    expect(result.isError).toBe(true)
    expect(readAttachment).not.toHaveBeenCalled()
  })
})
