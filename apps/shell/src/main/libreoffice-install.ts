import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

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

function installerCommand(): InstallerCommand | null {
  if (process.platform === 'darwin') {
    const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(existsSync)
    return brew ? { executable: brew, args: ['install', '--cask', 'libreoffice'] } : null
  }
  if (process.platform === 'win32') {
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
  if (process.platform === 'linux') {
    const pkexec = '/usr/bin/pkexec'
    if (!existsSync(pkexec)) return null
    if (existsSync('/usr/bin/apt-get')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/apt-get', 'install', '-y', 'libreoffice'],
      }
    }
    if (existsSync('/usr/bin/dnf')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/dnf', 'install', '-y', 'libreoffice'],
      }
    }
    if (existsSync('/usr/bin/yum')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/yum', 'install', '-y', 'libreoffice'],
      }
    }
    if (existsSync('/usr/bin/pacman')) {
      return {
        executable: pkexec,
        args: ['/usr/bin/pacman', '-S', '--noconfirm', 'libreoffice-fresh'],
      }
    }
  }
  return null
}

export function canAutoInstallLibreOffice(): boolean {
  return installerCommand() !== null
}

/** Install from the platform package manager without invoking a shell. */
export function installLibreOffice(
  onProgress?: (progress: LibreOfficeInstallProgress) => void,
): Promise<LibreOfficeInstallResult> {
  const command = installerCommand()
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
