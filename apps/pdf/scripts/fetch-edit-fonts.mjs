/**
 * Downloads the OFL fonts used as built-in edit fallbacks (Liberation + Noto).
 * Safe to re-run: skips files that already exist and look complete.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'resources', 'fonts')
mkdirSync(DEST, { recursive: true })

const LIBERATION_TAR =
  'https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz'
const LIBERATION_FILES = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationSans-Italic.ttf',
  'LiberationSans-BoldItalic.ttf',
  'LiberationSerif-Regular.ttf',
  'LiberationSerif-Bold.ttf',
  'LiberationSerif-Italic.ttf',
  'LiberationSerif-BoldItalic.ttf',
  'LiberationMono-Regular.ttf',
  'LiberationMono-Bold.ttf',
  'LiberationMono-Italic.ttf',
  'LiberationMono-BoldItalic.ttf',
]

const DIRECT = [
  [
    'NotoSans-Regular.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  ],
  [
    'NotoSans-Bold.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf',
  ],
  [
    'NotoSansSC-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
  ],
  [
    'NotoSansSC-Bold.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf',
  ],
  [
    'NotoSansTC-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf',
  ],
  [
    'NotoSansJP-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf',
  ],
  [
    'NotoSansKR-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf',
  ],
  [
    'NotoSerif-Regular.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-Regular.ttf',
  ],
  [
    'NotoSerif-Bold.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-Bold.ttf',
  ],
  [
    'NotoSerif-Italic.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-Italic.ttf',
  ],
  [
    'NotoSerif-BoldItalic.ttf',
    'https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSerif/NotoSerif-BoldItalic.ttf',
  ],
  [
    'NotoSerifSC-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf',
  ],
  [
    'NotoSerifSC-Bold.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf',
  ],
  [
    'NotoSerifTC-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/TC/NotoSerifTC-Regular.otf',
  ],
  [
    'NotoSerifJP-Regular.otf',
    'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/JP/NotoSerifJP-Regular.otf',
  ],
]

function complete(path) {
  return existsSync(path) && readFileSync(path).length > 10_000
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

async function fetchLiberation() {
  if (LIBERATION_FILES.every((name) => complete(join(DEST, name)))) {
    console.log('skip liberation (present)')
    return
  }
  const dir = await mkdtemp(join(tmpdir(), 'genoffice-fonts-'))
  try {
    const tar = join(dir, 'liberation.tar.gz')
    console.log('fetch liberation tarball')
    await download(LIBERATION_TAR, tar)
    execFileSync('tar', ['-xzf', tar, '-C', dir])
    for (const name of LIBERATION_FILES) {
      const found = execFileSync('find', [dir, '-name', name], { encoding: 'utf8' })
        .trim()
        .split('\n')[0]
      if (!found) throw new Error(`missing ${name} in tarball`)
      renameSync(found, join(DEST, name))
      console.log('  ', name, (readFileSync(join(DEST, name)).length / 1024).toFixed(0), 'KB')
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  await fetchLiberation()
  for (const [name, url] of DIRECT) {
    const dest = join(DEST, name)
    if (complete(dest)) {
      console.log('skip', name)
      continue
    }
    console.log('fetch', name)
    await download(url, dest)
    const size = readFileSync(dest).length
    if (size < 10_000) throw new Error(`${name} too small (${size} bytes)`)
    console.log('  ', (size / 1024 / 1024).toFixed(2), 'MB')
  }
}

await main()
