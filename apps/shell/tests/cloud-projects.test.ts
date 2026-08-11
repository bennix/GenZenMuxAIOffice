import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearCloudProjectsStore,
  cloudProjectExternalUrl,
  cloudStoreOwner,
  readCloudProjectsStore,
  syncCloudProjects,
} from '../src/main/cloud-projects'

describe('legacy cloud projects are disabled', () => {
  it('never exposes an account, cached project, or external project URL', async () => {
    expect(cloudStoreOwner()).toBe('')
    expect(readCloudProjectsStore('/unused')).toBeNull()
    expect(cloudProjectExternalUrl('/agents?id=old')).toBeNull()
    await expect(syncCloudProjects('/unused')).resolves.toEqual({
      available: false,
      projects: [],
      syncedAt: 0,
    })
  })

  it('removes a legacy cache', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloud-store-'))
    const path = join(dir, 'cloud-projects.json')
    writeFileSync(path, '{}')
    clearCloudProjectsStore(path)
    expect(existsSync(path)).toBe(false)
  })
})
