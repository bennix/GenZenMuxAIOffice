import { expect, it } from 'vitest'
import { installerCommand } from '../src/libreoffice-install'

it('uses Homebrew on macOS and the signed download fallback when unavailable', () => {
  expect(installerCommand('darwin', (p) => p === '/opt/homebrew/bin/brew')).toEqual({
    executable: '/opt/homebrew/bin/brew',
    args: ['install', '--cask', 'libreoffice'],
  })
  expect(installerCommand('darwin', () => false)).toBeNull()
})
it('uses the exact LibreOffice package on Windows', () => {
  const command = installerCommand('win32', () => false)
  expect(command?.executable).toBe('winget.exe')
  expect(command?.args).toContain('TheDocumentFoundation.LibreOffice')
  expect(command?.args).toContain('--exact')
})
it.each(['apt-get', 'dnf', 'yum', 'pacman'])(
  'uses privileged %s installation on Linux',
  (manager) => {
    const command = installerCommand(
      'linux',
      (p) => p === '/usr/bin/pkexec' || p === `/usr/bin/${manager}`,
    )
    expect(command?.executable).toBe('/usr/bin/pkexec')
    expect(command?.args[0]).toBe(`/usr/bin/${manager}`)
  },
)
