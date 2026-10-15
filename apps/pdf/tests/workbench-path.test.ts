// @vitest-environment node
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { workbenchPath } from '../src/main/workbench-path'

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
it('opens staged PDFs when the root uses a filesystem alias', async () => {
  const base = await mkdtemp(join(tmpdir(), 'workbench-path-'))
  cleanup.push(base)
  const root = join(base, 'real')
  const alias = join(base, 'alias')
  await mkdir(root)
  await symlink(root, alias, 'dir')
  await writeFile(join(root, 'input.pdf'), 'fixture')
  expect(await workbenchPath(alias, join(alias, 'input.pdf'))).toBe(
    await realpath(join(root, 'input.pdf')),
  )
  expect(await workbenchPath(alias, 'output.pdf')).toBe(join(await realpath(root), 'output.pdf'))
})
it('rejects traversal and symlink escapes including new output files', async () => {
  const base = await mkdtemp(join(tmpdir(), 'workbench-path-'))
  cleanup.push(base)
  const root = join(base, 'root')
  const external = join(base, 'external')
  await mkdir(root)
  await mkdir(external)
  await symlink(external, join(root, 'escape'), 'dir')
  await expect(workbenchPath(root, '../external/a.pdf')).rejects.toThrow('outside')
  await expect(workbenchPath(root, 'escape/new/a.pdf')).rejects.toThrow('outside')
})
