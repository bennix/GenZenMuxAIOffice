import { access, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadPrintHtml } from '../src/main/print-html'

describe('print HTML file lifetime', () => {
  it('loads large documents intact and retains them until printing completes', async () => {
    const html = '<!doctype html><p>中文打印</p><!--' + 'x'.repeat(4_000_000) + '-->'
    let path = ''
    const cleanup = await loadPrintHtml(
      {
        loadFile: async (file) => {
          path = file
        },
      },
      html,
    )
    try {
      expect(path.length).toBeLessThan(1024)
      expect(await readFile(path, 'utf8')).toBe(html)
    } finally {
      await cleanup()
    }
    await expect(access(dirname(path))).rejects.toThrow()
  })

  it('removes temporary content if navigation fails', async () => {
    let path = ''
    const error = new Error('window closed')
    await expect(
      loadPrintHtml(
        {
          loadFile: async (file) => {
            path = file
            throw error
          },
        },
        '<p>test</p>',
      ),
    ).rejects.toBe(error)
    await expect(access(dirname(path))).rejects.toThrow()
  })
})
