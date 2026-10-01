/** Fetch and verify the exact OfficeCLI binaries that the installer will bundle. */
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = '1.0.152'
const hashes = {
  'officecli-mac-arm64': 'e2ed6eba5cd46d6800139f2835097828b8ccd7c8c9b679463b50e45ba2f1dbf5',
  'officecli-mac-x64': '5071abef56c1d4a4d60e28ed12bc66183d8dc6a9783529c3f1a9cf6bdfe6c2dd',
  'officecli-win-x64.exe': '047705402974c3690a4437e55f620d03afac4beba4fdd28fdb59af610a3afff2',
  'officecli-linux-x64': 'e54d3c1d248372365f0634aac56d6f1918bd04d6e71afc792ad50e075f56cfe9',
}
const target = process.argv[2]
const assets =
  target === 'mac'
    ? ['officecli-mac-arm64', 'officecli-mac-x64']
    : target === 'win'
      ? ['officecli-win-x64.exe']
      : target === 'linux'
        ? ['officecli-linux-x64']
        : []
if (!assets.length) throw new Error('Usage: node tools/prepare-officecli.mjs mac|win|linux')

for (const asset of assets) {
  const path = join(root, 'apps', 'shell', 'build', 'officecli', asset)
  const valid = (bytes) => createHash('sha256').update(bytes).digest('hex') === hashes[asset]
  let bytes
  try {
    bytes = await readFile(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (bytes && !valid(bytes)) throw new Error(`Cached OfficeCLI checksum mismatch: ${asset}`)
  if (!bytes) {
    const response = await fetch(
      `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${version}/${asset}`,
      {
        signal: AbortSignal.timeout(300_000),
      },
    )
    if (!response.ok || !response.body)
      throw new Error(`OfficeCLI ${asset} download failed: HTTP ${response.status}`)
    const chunks = []
    let length = 0
    for await (const chunk of response.body) {
      length += chunk.length
      if (length > 512 * 1024 * 1024) throw new Error('OfficeCLI download too large')
      chunks.push(Buffer.from(chunk))
    }
    bytes = Buffer.concat(chunks)
    if (!valid(bytes)) throw new Error(`OfficeCLI checksum mismatch: ${asset}`)
    await mkdir(dirname(path), { recursive: true })
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, bytes, { flag: 'wx', mode: 0o700 })
      if (process.platform !== 'win32') await chmod(temp, 0o700)
      await rename(temp, path)
    } finally {
      await rm(temp, { force: true })
    }
  }
  process.stdout.write(`OfficeCLI ${version} verified: ${asset}\n`)
}
