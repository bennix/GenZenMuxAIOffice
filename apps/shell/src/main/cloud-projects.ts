import { unlinkSync } from 'node:fs'
import type { CloudProjectKind, CloudProjectsSnapshot } from '../shared/home-api'

const KINDS: readonly CloudProjectKind[] = ['docs', 'sheets', 'slides']

/** Kept for stored-data compatibility; the ZenMux build does not expose web projects. */
export function kindFromType(type: string): CloudProjectKind | 'other' {
  return KINDS.find((kind) => type.startsWith(kind)) ?? 'other'
}

export function cloudStoreOwner(): string {
  return ''
}

export function clearCloudProjectsStore(storePath: string): void {
  try {
    unlinkSync(storePath)
  } catch {
    // No legacy cache exists.
  }
}

export function readCloudProjectsStore(_storePath: string): CloudProjectsSnapshot | null {
  return null
}

export function syncCloudProjects(_storePath: string): Promise<CloudProjectsSnapshot> {
  return Promise.resolve({ available: false, projects: [], syncedAt: 0 })
}

export function cloudProjectExternalUrl(_projectUrl: unknown): string | null {
  return null
}
