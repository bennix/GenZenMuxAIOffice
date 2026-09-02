import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

/** Locate Cargo even when a GUI app or an already-open terminal has stale PATH. */
export function resolveCargoExecutable() {
  const executable = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
  const configuredHome = process.env.CARGO_HOME?.trim()
  const configuredCargo = process.env.CARGO?.trim()
  const candidates = [
    configuredCargo,
    join(configuredHome || join(homedir(), '.cargo'), 'bin', executable),
    ...(process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, executable)),
  ]
  return (
    candidates.find((candidate) => candidate && isAbsolute(candidate) && existsSync(candidate)) ??
    null
  )
}
