import {
  bibliographyEntry,
  exportBibTeX,
  type CitationRecord,
  type CitationStyle,
} from '@genoffice/citations'

// Tiptap's Markdown serializer escapes literal brackets (`\[@key\]`) while
// imported/Pandoc-authored Markdown commonly keeps the standard `[@key]`.
// Treat both spellings as the same citation.
const CITE_RE = /(?:\\)?\[@([A-Za-z0-9_.:+/-]+)(?:\\)?\]/g
const REFERENCE_HEADING_RE = /(?:^|\n)## (?:参考文献|References)\s*\n(?=\n*- )/

export function citationToken(record: CitationRecord): string {
  return `[@${record.citationKey}]`
}

export function citedKeys(markdown: string): string[] {
  const body = stripGeneratedBibliography(markdown)
  const result: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  CITE_RE.lastIndex = 0
  while ((match = CITE_RE.exec(body))) {
    const key = match[1]!
    if (!seen.has(key)) {
      seen.add(key)
      result.push(key)
    }
  }
  return result
}

export function stripGeneratedBibliography(markdown: string): string {
  const match = REFERENCE_HEADING_RE.exec(markdown)
  if (!match) return markdown.trimEnd()
  const suffix = markdown.slice(match.index).trim()
  const lines = suffix.split(/\r?\n/)
  if (!/^## (?:参考文献|References)$/.test(lines[0]!.trim())) return markdown.trimEnd()
  if (lines.slice(1).some((line) => line.trim() && !line.trimStart().startsWith('- '))) {
    return markdown.trimEnd()
  }
  return markdown.slice(0, match.index).trimEnd()
}

export function syncBibliography(
  markdown: string,
  records: ReadonlyMap<string, CitationRecord>,
  style: CitationStyle,
  language: 'zh' | 'en',
): { markdown: string; records: CitationRecord[]; bibTeX: string } {
  const body = stripGeneratedBibliography(markdown)
  const used = citedKeys(body)
    .map((key) => records.get(key))
    .filter((record): record is CitationRecord => Boolean(record))
  if (!used.length) return { markdown: body, records: [], bibTeX: '' }
  const heading = language === 'zh' ? '参考文献' : 'References'
  const entries = used.map((record, index) => `- ${bibliographyEntry(record, style, index + 1)}`)
  return {
    markdown: `${body}\n\n## ${heading}\n\n${entries.join('\n')}\n`,
    records: used,
    bibTeX: `${exportBibTeX(used)}\n`,
  }
}
