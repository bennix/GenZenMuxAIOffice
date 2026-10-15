import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

const outside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)
}

/** Resolve aliases on both sides, including existing parents of new output files. */
export async function workbenchPath(root: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value) throw new Error('A file path is required')
  const canonicalRoot = await realpath(root)
  let ancestor = resolve(isAbsolute(value) ? value : join(root, value))
  const missing: string[] = []
  while (true) {
    try {
      const canonical = await realpath(ancestor)
      const target = join(canonical, ...missing)
      if (outside(canonicalRoot, target)) throw new Error('Path is outside the workbench')
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missing.unshift(basename(ancestor))
      ancestor = parent
    }
  }
}
