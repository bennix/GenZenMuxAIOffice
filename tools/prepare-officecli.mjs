/** Fetch and verify the exact OfficeCLI binaries that the installer will bundle. */
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = '1.0.154'
const hashes = {
  'officecli-mac-arm64': 'a05c82e04bd0f283ea309f20e4092d540632438cba8ecbf192e65209f780c372',
  'officecli-mac-x64': 'd7a63396a76f436c6bc993092c999ee1d37f985eacce2b09a3a3eba37c9baa4f',
  'officecli-win-x64.exe': '50a57626ff7c5b11034c23368312cdafbd436cf81eb149c81dc488e027a56e7e',
  'officecli-linux-x64': 'ac57d4d94209c21e34fc133eea2b55670e5f966a9e8e6b68f656b9410db5dbae',
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
