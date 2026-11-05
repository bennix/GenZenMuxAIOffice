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

it('leaves nested AI attachment drops to the local handler but opens ordinary document drops', async () => {
  const { installDocumentDropBridge } = await import('../src/document-drop')
  const handlers = new Map<string, EventListener>()
  const calls: string[][] = []
  const target = {
    addEventListener: (name: string, handler: EventListener) => handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
  } as unknown as Window
  const dispose = installDocumentDropBridge({
    target,
    getPathForFile: () => '/tmp/lesson.pdf',
    openPaths: (paths) => calls.push([...paths]),
  })
  let intercepted = false
  const event = (path: unknown[]) =>
    ({
      dataTransfer: { files: [{}] },
      composedPath: () => path,
      preventDefault: () => {
        intercepted = true
      },
      stopImmediatePropagation: () => {
        intercepted = true
      },
    }) as unknown as Event
  const zone = { hasAttribute: (name: string) => name === 'data-ai-attachment-drop' }
  handlers.get('drop')!(event([{}, zone, target]))
  expect(calls).toEqual([])
  expect(intercepted).toBe(false)
  handlers.get('drop')!(event([{}, target]))
  expect(calls).toEqual([['/tmp/lesson.pdf']])
  expect(intercepted).toBe(true)
  dispose()
  expect(handlers.size).toBe(0)
})
