// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => resolve(import.meta.dirname, '../../shell') },
}))
import { exportVisualPptx } from '../src/main/officecli-visual-export'

it('confirms the actual exported file and returns its real path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'visual-pptx-save-'))
  try {
    const destination = join(directory, '中文 保真.pptx')
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    const saved = await exportVisualPptx([png], destination, 1280, 720)
    expect(saved).toBe(await realpath(destination))
    expect((await stat(saved)).size).toBeGreaterThan(0)
    expect((await readFile(saved)).subarray(0, 2).toString()).toBe('PK')
    await writeFile(destination, 'original')
    await expect(exportVisualPptx([], destination, 1280, 720)).rejects.toThrow()
    expect(await readFile(destination, 'utf8')).toBe('original')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
