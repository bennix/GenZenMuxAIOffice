import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile, cp } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const INSTALL_TIMEOUT_MS = 20 * 60_000
const MAX_OUTPUT_CHARS = 32_000

export const LIBREOFFICE_DOWNLOAD_URL = 'https://www.libreoffice.org/download/download-libreoffice/'

export interface LibreOfficeInstallResult {
  readonly ok: boolean
  readonly detail: string
}

export interface LibreOfficeInstallProgress {
  readonly message: string
  readonly percent?: number
}

interface InstallerCommand {
  readonly executable: string
  readonly args: readonly string[]
}

export function installerCommand(
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): InstallerCommand | null {
  if (platform === 'darwin') {
    const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(exists)
    return brew ? { executable: brew, args: ['install', '--cask', 'libreoffice'] } : null
  }
  if (platform === 'win32') {
    return {
      executable: 'winget.exe',
      args: [
        'install',
        '--id',
        'TheDocumentFoundation.LibreOffice',
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent',
      ],
    }
  }
  if (platform === 'linux') {
    const pkexec = '/usr/bin/pkexec'
    if (!exists(pkexec)) return null
    if (exists('/usr/bin/apt-get')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/apt-get', 'install', '-y', 'libreoffice', 'poppler-utils'],
      }
    }
    if (exists('/usr/bin/dnf')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/dnf', 'install', '-y', 'libreoffice', 'poppler-utils'],
      }
    }
    if (exists('/usr/bin/yum')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/yum', 'install', '-y', 'libreoffice', 'poppler-utils'],
      }
    }
    if (exists('/usr/bin/pacman')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/pacman', '-S', '--noconfirm', 'libreoffice-fresh', 'poppler'],
      }
    }
  }
  return null
}

export function canAutoInstallLibreOffice(): boolean {
  return process.platform === 'darwin' || installerCommand() !== null
}

/** Install from the platform package manager without invoking a shell. */
export function installLibreOffice(
  onProgress?: (progress: LibreOfficeInstallProgress) => void,
): Promise<LibreOfficeInstallResult> {
  const command = installerCommand()
  if (!command && process.platform === 'darwin') return installMacFromOfficialDownload(onProgress)
  if (!command) {
    return Promise.resolve({ ok: false, detail: 'No supported package manager was found.' })
  }
  return new Promise((resolve) => {
    onProgress?.({ message: `$ ${command.executable} ${command.args.join(' ')}` })
    const child = spawn(command.executable, [...command.args], {
      env: process.env,
      shell: false,
      windowsHide: false,
    })
    onProgress?.({ message: `Process started (PID ${child.pid ?? 'pending'})` })
    let output = ''
    let settled = false
    const append = (chunk: Buffer): void => {
      const ansiEscapeSequence = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, 'g')
      const text = chunk.toString('utf8').replace(ansiEscapeSequence, '')
      output = `${output}${text}`.slice(-MAX_OUTPUT_CHARS)
      const messages = text
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter(Boolean)
      for (const message of messages) {
        const match = /(?:^|\s)(\d{1,3}(?:\.\d+)?)%/.exec(message)
        const parsed = match ? Number.parseFloat(match[1]) : undefined
        const percent = parsed !== undefined && parsed >= 0 && parsed <= 100 ? parsed : undefined
        onProgress?.({ message, ...(percent === undefined ? {} : { percent }) })
      }
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    const finish = (ok: boolean, detail: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, detail: detail || output.trim() })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(false, 'LibreOffice installation timed out after 20 minutes.')
    }, INSTALL_TIMEOUT_MS)
    child.once('error', (error) => finish(false, error.message))
    child.once('exit', (code) =>
      finish(code === 0, output.trim() || `Installer exited with code ${code ?? 'unknown'}.`),
    )
  })
}

/** Official signed DMG fallback for Macs without Homebrew; installs for this user. */
async function installMacFromOfficialDownload(
  onProgress?: (progress: LibreOfficeInstallProgress) => void,
): Promise<LibreOfficeInstallResult> {
  const run = promisify(execFile)
  const directory = await mkdtemp(join(tmpdir(), 'zenoffice-libreoffice-'))
  const mount = join(directory, 'mount')
  let mounted = false
  try {
    onProgress?.({ message: 'Downloading LibreOffice from The Document Foundation…' })
    const root = 'https://download.documentfoundation.org/libreoffice/stable/'
    const listing = await fetch(root, { signal: AbortSignal.timeout(30_000) })
    if (!listing.ok) throw new Error(`Official download index: HTTP ${listing.status}`)
    const versions = [...(await listing.text()).matchAll(/href="(\d+\.\d+\.\d+)\/"/g)].map(
      (m) => m[1],
    )
    versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const version = versions.at(-1)
    if (!version) throw new Error('No stable LibreOffice release found')
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    const url = `${root}${version}/mac/${arch}/LibreOffice_${version}_MacOS_${arch}.dmg`
    const response = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) })
    if (!response.ok) throw new Error(`LibreOffice download: HTTP ${response.status}`)
    const image = join(directory, 'LibreOffice.dmg')
    await writeFile(image, Buffer.from(await response.arrayBuffer()))
    await mkdir(mount)
    await run(
      '/usr/bin/hdiutil',
      ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, image],
      { timeout: 120_000 },
    )
    mounted = true
    const source = join(mount, 'LibreOffice.app')
    onProgress?.({ message: 'Verifying the official application signature…' })
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { timeout: 120_000 })
    await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', source], { timeout: 120_000 })
    const applications = join(homedir(), 'Applications')
    await mkdir(applications, { recursive: true })
    const destination = join(applications, 'LibreOffice.app')
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true })
    await run(join(destination, 'Contents/MacOS/soffice'), ['--version'], { timeout: 30_000 })
    return { ok: true, detail: destination }
  } catch (error) {
    return { ok: false, detail: String(error) }
  } finally {
    if (mounted)
      await run('/usr/bin/hdiutil', ['detach', mount], { timeout: 30_000 }).catch(() => {})
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
