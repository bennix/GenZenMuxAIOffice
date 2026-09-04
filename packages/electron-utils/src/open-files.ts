export type OpenFileKind = 'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown'

export interface OpenFileRef {
  id: string
  kind: OpenFileKind
  title: string
  filePath: string
  active: boolean
}

export const OPEN_FILES_CHANNEL = 'tabs:open-files'

export function isOpenFileKind(kind: string): kind is OpenFileKind {
  return (
    kind === 'docs' ||
    kind === 'sheets' ||
    kind === 'slides' ||
    kind === 'pdf' ||
    kind === 'markdown'
  )
}

/** The `@query` immediately before the cursor, or null when this is not a file mention. */
export function atMentionQuery(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > value.length) return null
  const before = value.slice(0, cursor)
  const match = /(?:^|[\s(\[{])@([^\s@]*)$/u.exec(before)
  if (!match) return null
  const query = match[1] ?? ''
  if (/^connect\b/iu.test(query)) return null
  return { start: before.lastIndexOf('@'), query }
}

export function filterOpenFiles(
  files: readonly OpenFileRef[],
  query: string,
  excludeActive = true,
): OpenFileRef[] {
  const needle = query.trim().toLowerCase()
  return files.filter((file) => {
    if (!file.filePath) return false
    if (excludeActive && file.active) return false
    if (!needle) return true
    return file.title.toLowerCase().includes(needle) || file.filePath.toLowerCase().includes(needle)
  })
}

export function applyFileMention(
  value: string,
  cursor: number,
  start: number,
  title: string,
): { text: string; cursor: number } {
  const inserted = `@${title} `
  const text = `${value.slice(0, start)}${inserted}${value.slice(cursor)}`
  return { text, cursor: start + inserted.length }
}
