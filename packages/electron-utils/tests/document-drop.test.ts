import { describe, expect, it } from 'vitest'
import { droppedOfficeDocumentPaths, isDroppedOfficeDocument } from '../src/document-drop'

describe('document drop routing', () => {
  it('accepts every editor document extension', () => {
    for (const path of [
      '/a.docx',
      '/a.doc',
      '/a.xlsx',
      '/a.xls',
      '/a.csv',
      '/a.pptx',
      '/a.pdf',
      '/a.md',
      '/a.markdown',
    ]) {
      expect(isDroppedOfficeDocument(path), path).toBe(true)
    }
  })

  it('does not steal image drops from document editors', () => {
    expect(isDroppedOfficeDocument('/tmp/photo.png')).toBe(false)
    expect(isDroppedOfficeDocument('/tmp/video.mp4')).toBe(false)
  })

  it('deduplicates and limits routed paths', () => {
    const files = [{ name: 'a' }, { name: 'b' }, { name: 'c' }] as unknown as File[]
    const paths = ['/tmp/a.xlsx', '/tmp/a.xlsx', '/tmp/b.pdf']
    expect(droppedOfficeDocumentPaths(files, (file) => paths[files.indexOf(file)]!, 2)).toEqual([
      '/tmp/a.xlsx',
      '/tmp/b.pdf',
    ])
  })
})
