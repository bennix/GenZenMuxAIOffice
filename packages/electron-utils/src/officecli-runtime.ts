import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface OfficeCliRuntimeOptions {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}

// v1.0.152 的 Linux 单文件版缺少运行时程序集；v1.0.154 已在 Linux .NET 10 上通过完整 PPTX 校验。
const VERSION = '1.0.154'
const MAC_DEVELOPER_TEAM_ID = '5N66S29EK2'
// Pinned upstream release assets; never execute a download without this check.
const HASHES: Record<string, string> = {
  'officecli-mac-arm64': 'a05c82e04bd0f283ea309f20e4092d540632438cba8ecbf192e65209f780c372',
  'officecli-mac-x64': 'd7a63396a76f436c6bc993092c999ee1d37f985eacce2b09a3a3eba37c9baa4f',
  'officecli-win-arm64.exe': '9460ee2064301ea5520d9879d93c780b47cd07faf679f73ac5d449e067651a7c',
  'officecli-win-x64.exe': '50a57626ff7c5b11034c23368312cdafbd436cf81eb149c81dc488e027a56e7e',
  'officecli-linux-arm64': '7e8d23026e678fb5222e55e88a5e4b80226738cb83592ae2268b8a17e480a765',
  'officecli-linux-x64': 'ac57d4d94209c21e34fc133eea2b55670e5f966a9e8e6b68f656b9410db5dbae',
}

function assetName(): string {
  const os = (
    { darwin: 'mac', win32: 'win', linux: 'linux' } as Partial<Record<NodeJS.Platform, string>>
  )[process.platform]
  if (!os || !['arm64', 'x64'].includes(process.arch))
    throw new Error('OfficeCLI platform unsupported')
  return `officecli-${os}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`
}

function verify(asset: string, bytes: Buffer): void {
  if (createHash('sha256').update(bytes).digest('hex') !== HASHES[asset])
    throw new Error(`OfficeCLI checksum mismatch: ${asset}`)
}

export function assertExpectedMacSignatureDetails(asset: string, details: string): void {
  const identifier = details.match(/^Identifier=(.+)$/m)?.[1]
  const teamId = details.match(/^TeamIdentifier=(.+)$/m)?.[1]
  if (identifier !== asset || teamId !== MAC_DEVELOPER_TEAM_ID) {
    throw new Error(
      `OfficeCLI code signature identity mismatch: expected ${asset} from team ${MAC_DEVELOPER_TEAM_ID}`,
    )
  }
}

async function runCodesign(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codesign', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-16_000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-16_000)
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`codesign ${args[0]} failed (${code}): ${output.trim()}`))
    })
  })
}

async function verifyPackagedMacSignature(asset: string, binaryPath: string): Promise<void> {
  // macOS 发布签名会改变 Mach-O 字节，因此构建时已校验上游哈希，运行时改校验签名封印。
  await runCodesign(['--verify', '--strict', binaryPath])
  const details = await runCodesign(['--display', '--verbose=4', binaryPath])
  assertExpectedMacSignatureDetails(asset, details)
}

export async function resolveOfficeCli(options: OfficeCliRuntimeOptions): Promise<string> {
  const asset = assetName()
  if (options.isPackaged) {
    const bundled = join(options.resourcesPath, 'officecli', asset)
    try {
      const bytes = await readFile(bundled)
      try {
        verify(asset, bytes)
      } catch (checksumError) {
        if (process.platform !== 'darwin' || !asset.startsWith('officecli-mac-'))
          throw checksumError
        // 已签名的 macOS Mach-O 无法保留上游哈希；这里依靠代码签名封印验证完整性。
        await verifyPackagedMacSignature(asset, bundled)
      }
      return bundled
    } catch (error) {
      throw new Error(`Bundled OfficeCLI unavailable or invalid: ${String(error)}`, {
        cause: error,
      })
    }
  }
  for (const bundled of [
    join(options.appPath, 'build', 'officecli', asset),
    join(process.cwd(), 'apps', 'shell', 'build', 'officecli', asset),
  ]) {
    try {
      verify(asset, await readFile(bundled))
      return bundled
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const path = join(homedir(), '.genoffice', 'tools', 'officecli', VERSION, asset)
  try {
    verify(asset, await readFile(path))
    return path
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const response = await fetch(
    `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${VERSION}/${asset}`,
    {
      signal: AbortSignal.timeout(300_000),
    },
  )
  if (!response.ok || !response.body)
    throw new Error(`OfficeCLI download failed: HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > 512 * 1024 * 1024) throw new Error('OfficeCLI download too large')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 512 * 1024 * 1024) throw new Error('OfficeCLI download too large')
  verify(asset, bytes)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o700 })
    if (process.platform !== 'win32') await chmod(temp, 0o700)
    try {
      await rename(temp, path)
    } catch (error) {
      try {
        verify(asset, await readFile(path))
      } catch {
        throw error
      }
    }
  } finally {
    await rm(temp, { force: true })
  }
  return path
}

export function invokeOfficeCli(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OFFICECLI_RESIDENT_FLUSH: 'each' },
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('OfficeCLI timed out'))
    }, 120_000)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-100_000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`OfficeCLI ${args[0]} failed (${code}): ${stderr || stdout}`))
    })
  })
}
