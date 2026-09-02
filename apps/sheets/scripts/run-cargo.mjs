#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

import { resolveCargoExecutable } from './cargo-executable.mjs'

const cargo = resolveCargoExecutable()
if (!cargo) {
  console.error(
    '[sheets-native] Cargo was not found. Install Rust from https://rustup.rs/ and restart the terminal.',
  )
  process.exit(127)
}

const result = spawnSync(cargo, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  console.error(`[sheets-native] Could not start ${cargo}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
