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

const VERSION = '1.0.152'
// Pinned upstream release assets; never execute a download without this check.
const HASHES: Record<string, string> = {
  'officecli-mac-arm64': 'e2ed6eba5cd46d6800139f2835097828b8ccd7c8c9b679463b50e45ba2f1dbf5',
  'officecli-mac-x64': '5071abef56c1d4a4d60e28ed12bc66183d8dc6a9783529c3f1a9cf6bdfe6c2dd',
  'officecli-win-arm64.exe': '82408eca64c0f7a79679754162320aae510b26f4cf93933c9304dbd07a379c83',
  'officecli-win-x64.exe': '047705402974c3690a4437e55f620d03afac4beba4fdd28fdb59af610a3afff2',
  'officecli-linux-arm64': 'bc06deaa0ad931f5208717a40b94018dc44cdff0d8eefa842c4f4daf89fb35a8',
  'officecli-linux-x64': 'e54d3c1d248372365f0634aac56d6f1918bd04d6e71afc792ad50e075f56cfe9',
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

export async function resolveOfficeCli(options: OfficeCliRuntimeOptions): Promise<string> {
  const asset = assetName()
  if (options.isPackaged) {
    const bundled = join(options.resourcesPath, 'officecli', asset)
    try {
      verify(asset, await readFile(bundled))
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
