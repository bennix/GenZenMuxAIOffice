import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface DeckManifest {
  version: 1
  name: string
  revision: string
  slides: string[]
  pptx: string
}

function safeName(name: string): string {
  if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(name))
    throw new Error('Use 1–80 letters, numbers, hyphens or underscores for the deck name.')
  return name
}

function safeSlidePath(path: string): string {
  if (!/^slides\/[a-zA-Z0-9_-]+\.html$/.test(path))
    throw new Error('Invalid slide path in deck.json')
  return path
}

/** Fingerprint both manifest and sources, so external HTML changes also conflict. */
export async function readDeck(
  root: string,
  name: string,
): Promise<{ manifest: DeckManifest; revision: string; pagesHtml: string[] } | null> {
  const dir = join(root, safeName(name))
  let raw: string
  try {
    raw = await readFile(join(dir, 'deck.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const manifest = JSON.parse(raw) as DeckManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.slides) || manifest.slides.length > 100)
    throw new Error('Invalid deck manifest')
  const pagesHtml = await Promise.all(
    manifest.slides.map((path) => readFile(join(dir, safeSlidePath(path)), 'utf8')),
  )
  const revision = createHash('sha256')
    .update(JSON.stringify([raw, pagesHtml]))
    .digest('hex')
  return { manifest, revision, pagesHtml }
}

export async function publishDeck(
  root: string,
  name: string,
  pagesHtml: string[],
  pptx: Uint8Array,
  expectedRevision: string | null,
) {
  const dir = join(root, safeName(name))
  if (
    !pagesHtml.length ||
    pagesHtml.length > 100 ||
    pagesHtml.some((page) => typeof page !== 'string' || page.length > 5_000_000)
  )
    throw new Error('Deck must have 1–100 HTML slides, each under 5 MB.')
  await mkdir(dir, { recursive: true })
  const lock = await open(join(dir, '.publish.lock'), 'wx').catch(() => {
    throw new Error('Another publisher is writing this deck. Retry after it finishes.')
  })
  const id = randomUUID()
  const temporary = join(dir, `.deck-${id}.json`)
  try {
    const current = await readDeck(root, name)
    if ((current?.revision ?? null) !== expectedRevision)
      throw new Error('Deck changed externally. Read the current revision before publishing again.')
    await mkdir(join(dir, 'slides'), { recursive: true })
    await mkdir(join(dir, 'assets'), { recursive: true })
    const slides = pagesHtml.map((_, i) => `slides/${id}-${String(i + 1).padStart(3, '0')}.html`)
    await Promise.all(
      slides.map((path, i) => writeFile(join(dir, path), pagesHtml[i]!, { flag: 'wx' })),
    )
    const pptxPath = `${id}.pptx`
    await writeFile(join(dir, pptxPath), pptx, { flag: 'wx' })
    const manifest: DeckManifest = { version: 1, name, revision: id, slides, pptx: pptxPath }
    await writeFile(temporary, JSON.stringify(manifest, null, 2))
    // Re-check external edits made while the build was being written.
    if (((await readDeck(root, name))?.revision ?? null) !== expectedRevision)
      throw new Error('Deck changed during publication; source files were not replaced.')
    await rename(temporary, join(dir, 'deck.json'))
    return {
      ...(await readDeck(root, name))!,
      path: join(dir, pptxPath),
      sourcePath: join(dir, 'deck.json'),
    }
  } finally {
    await rm(temporary, { force: true })
    await lock.close()
    await rm(join(dir, '.publish.lock'), { force: true })
  }
}

/** Content-addressed bitmap assets: no remote fetch, arbitrary extension or executable SVG. */
export async function importDeckAsset(root: string, name: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 25_000_000)
    throw new Error('Image must be between 1 byte and 25 MB.')
  const b = Buffer.from(bytes)
  const png = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255
  const webp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
  const ext = png ? 'png' : jpeg ? 'jpg' : webp ? 'webp' : null
  if (!ext) throw new Error('Only PNG, JPEG and WebP images are supported.')
  const dir = join(root, safeName(name), 'assets')
  await mkdir(dir, { recursive: true })
  const file = `${createHash('sha256').update(b).digest('hex')}.${ext}`
  await writeFile(join(dir, file), b)
  return {
    path: `assets/${file}`,
    dataUrl: `data:image/${jpeg ? 'jpeg' : ext};base64,${b.toString('base64')}`,
  }
}
