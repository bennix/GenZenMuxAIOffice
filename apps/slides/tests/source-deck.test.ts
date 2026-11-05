// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importDeckAsset, publishDeck, readDeck } from '../../../packages/slides/src/index'

const roots: string[] = []
async function root() {
  const dir = await mkdtemp(join(tmpdir(), 'slides-source-'))
  roots.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
describe('source deck publication', () => {
  it('preserves sources and refuses stale updates including external HTML edits', async () => {
    const dir = await root()
    const deck = await publishDeck(dir, '测试', ['<html>one</html>'], new Uint8Array([1, 2]), null)
    expect((await readDeck(dir, '测试'))?.pagesHtml).toEqual(['<html>one</html>'])
    await writeFile(join(dir, '测试', deck.manifest.slides[0]!), '<html>external edit</html>')
    await expect(
      publishDeck(dir, '测试', ['<html>overwrite</html>'], new Uint8Array([3]), deck.revision),
    ).rejects.toThrow('changed externally')
    const latest = (await readDeck(dir, '测试'))!
    const updated = await publishDeck(
      dir,
      '测试',
      ['<html>merged</html>'],
      new Uint8Array([3]),
      latest.revision,
    )
    expect(updated.revision).not.toBe(latest.revision)
    expect(await readFile(updated.path)).toEqual(Buffer.from([3]))
  })
  it('permits only one competing publisher', async () => {
    const dir = await root()
    const jobs = await Promise.allSettled(
      [1, 2].map(() => publishDeck(dir, 'same', ['<html/>'], new Uint8Array([1]), null)),
    )
    expect(jobs.filter((j) => j.status === 'fulfilled')).toHaveLength(1)
  })
  it('rejects path traversal and unsupported assets', async () => {
    const dir = await root()
    await expect(readDeck(dir, '../escape')).rejects.toThrow('deck name')
    await expect(importDeckAsset(dir, 'safe', Buffer.from('<svg/>'))).rejects.toThrow('PNG')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const asset = await importDeckAsset(dir, 'safe', png)
    expect(asset.path).toMatch(/^assets\/[a-f0-9]+\.png$/)
    expect(await readFile(join(dir, 'safe', asset.path))).toEqual(png)
  })
})
