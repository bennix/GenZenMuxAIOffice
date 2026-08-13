import type { CitationAuthor, CitationRecord, CitationStyle, CitationType } from './types'

const clean = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const stripDoi = (value: unknown): string =>
  clean(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
const normalTitle = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

export function authorName(author: CitationAuthor, inverted = false): string {
  if (author.literal) return author.literal
  const family = clean(author.family)
  const given = clean(author.given)
  return inverted && family
    ? `${family}${given ? `, ${given}` : ''}`
    : [given, family].filter(Boolean).join(' ')
}

export function makeCitationKey(
  record: Pick<CitationRecord, 'authors' | 'year' | 'title'>,
): string {
  const lead = clean(record.authors[0]?.family || record.authors[0]?.literal || 'ref')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
  const word = clean(record.title)
    .split(/\s+/)
    .find((part) => part.length > 3)
    ?.replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
  return `${lead || 'ref'}${record.year || 'nd'}${word || ''}`
}

export function recordId(record: Partial<CitationRecord>): string {
  const doi = stripDoi(record.doi)
  if (doi) return `doi:${doi.toLowerCase()}`
  if (record.pmid) return `pmid:${clean(record.pmid)}`
  if (record.arxivId) return `arxiv:${clean(record.arxivId).toLowerCase()}`
  return `title:${normalTitle(clean(record.title))}:${record.year || ''}`
}

export function normalizeRecord(input: Partial<CitationRecord>): CitationRecord {
  const record: CitationRecord = {
    id: '',
    citationKey: '',
    type: input.type || 'other',
    title: clean(input.title) || 'Untitled',
    authors: Array.isArray(input.authors) ? input.authors.filter(Boolean) : [],
    source: clean(input.source) || 'Imported',
    isPreprint: input.isPreprint === true || input.type === 'preprint',
    ...(input.year ? { year: Number(input.year) } : {}),
    ...(input.containerTitle ? { containerTitle: clean(input.containerTitle) } : {}),
    ...(input.volume ? { volume: clean(input.volume) } : {}),
    ...(input.issue ? { issue: clean(input.issue) } : {}),
    ...(input.pages ? { pages: clean(input.pages) } : {}),
    ...(input.publisher ? { publisher: clean(input.publisher) } : {}),
    ...(stripDoi(input.doi) ? { doi: stripDoi(input.doi) } : {}),
    ...(input.pmid ? { pmid: clean(input.pmid) } : {}),
    ...(input.arxivId ? { arxivId: clean(input.arxivId) } : {}),
    ...(input.url ? { url: clean(input.url) } : {}),
    ...(input.abstract ? { abstract: clean(input.abstract) } : {}),
    ...(input.peerReviewed !== undefined ? { peerReviewed: input.peerReviewed } : {}),
    ...(input.openAccess !== undefined ? { openAccess: input.openAccess } : {}),
    ...(input.pdfUrl ? { pdfUrl: clean(input.pdfUrl) } : {}),
  }
  record.id = input.id || recordId(record)
  record.citationKey = input.citationKey || makeCitationKey(record)
  return record
}

export function dedupeRecords(records: CitationRecord[]): CitationRecord[] {
  const result = new Map<string, CitationRecord>()
  for (const raw of records) {
    const item = normalizeRecord(raw)
    const key = recordId(item)
    const old = result.get(key)
    if (!old) result.set(key, item)
    else {
      result.set(
        key,
        normalizeRecord({
          ...item,
          ...old,
          abstract: old.abstract || item.abstract,
          pdfUrl: old.pdfUrl || item.pdfUrl,
          url: old.url || item.url,
          openAccess: old.openAccess || item.openAccess,
          peerReviewed: old.peerReviewed ?? item.peerReviewed,
        }),
      )
    }
  }
  return [...result.values()]
}

function leadAuthor(record: CitationRecord): string {
  const first = record.authors[0]
  if (!first) return 'Anon.'
  const name = first.family || first.literal || 'Anon.'
  return record.authors.length > 2
    ? `${name} et al.`
    : record.authors
        .map((a) => a.family || a.literal)
        .filter(Boolean)
        .join(' & ')
}

export function inlineCitation(record: CitationRecord, style: CitationStyle, index = 1): string {
  if (style === 'apa7') return `(${leadAuthor(record)}, ${record.year || 'n.d.'})`
  return `[${index}]`
}

function authorsLine(record: CitationRecord, style: CitationStyle): string {
  if (!record.authors.length) return 'Anonymous'
  if (style === 'apa7') {
    return record.authors
      .map((a) => {
        const initials = clean(a.given)
          .split(/\s+/)
          .filter(Boolean)
          .map((n) => `${n[0]}.`)
          .join(' ')
        return a.literal || `${a.family || ''}, ${initials}`.trim()
      })
      .join(', ')
  }
  return record.authors.map((a) => authorName(a, style === 'gb7714')).join(', ')
}

export function bibliographyEntry(record: CitationRecord, style: CitationStyle, index = 1): string {
  const authors = authorsLine(record, style)
  const title = record.title.replace(/[.。]+$/, '')
  const venue = record.containerTitle || record.publisher || ''
  const details = [
    record.year,
    record.volume,
    record.issue ? `(${record.issue})` : '',
    record.pages,
  ]
    .filter(Boolean)
    .join(', ')
  const locator = record.doi ? `https://doi.org/${record.doi}` : record.url || ''
  if (style === 'apa7')
    return `${authors} (${record.year || 'n.d.'}). ${title}. ${venue}${details ? `, ${details}` : ''}. ${locator}`
      .replace(/\s+/g, ' ')
      .trim()
  const prefix = style === 'nature' ? `${index}.` : `[${index}]`
  if (style === 'gb7714')
    return `${prefix} ${authors}. ${title}[${record.isPreprint ? 'EB/OL' : record.type === 'book' ? 'M' : 'J'}]. ${venue}${details ? `, ${details}` : ''}. ${locator}`
      .replace(/\s+/g, ' ')
      .trim()
  return `${prefix} ${authors}, “${title},” ${venue}${details ? `, ${details}` : ''}. ${locator}`
    .replace(/\s+/g, ' ')
    .trim()
}

const TYPE_MAP: Record<string, CitationType> = {
  article: 'article-journal',
  'article-journal': 'article-journal',
  journal: 'article-journal',
  book: 'book',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  report: 'report',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  online: 'webpage',
  preprint: 'preprint',
}

function parseBibAuthors(value: string): CitationAuthor[] {
  return value.split(/\s+and\s+/i).map((name) => {
    const bits = name.split(',').map(clean)
    if (bits.length > 1) return { family: bits[0], given: bits.slice(1).join(' ') }
    const words = clean(name).split(/\s+/)
    return words.length > 1
      ? { family: words.pop(), given: words.join(' ') }
      : { literal: clean(name) }
  })
}

export function parseBibTeX(text: string): CitationRecord[] {
  const out: CitationRecord[] = []
  const entry = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)(?=\n?\s*@\w+\s*\{|\s*$)/g
  let match: RegExpExecArray | null
  while ((match = entry.exec(text))) {
    const fields: Record<string, string> = {}
    const body = match[3]!.replace(/\}\s*$/, '')
    const field = /(\w+)\s*=\s*(?:\{([\s\S]*?)\}|"([\s\S]*?)"|([^,\n]+))\s*,?/g
    let f: RegExpExecArray | null
    while ((f = field.exec(body))) fields[f[1]!.toLowerCase()] = clean(f[2] ?? f[3] ?? f[4])
    out.push(
      normalizeRecord({
        citationKey: clean(match[2]),
        type: TYPE_MAP[match[1]!.toLowerCase()] || 'other',
        title: fields.title,
        authors: parseBibAuthors(fields.author || ''),
        year: Number(fields.year) || undefined,
        containerTitle: fields.journal || fields.booktitle,
        publisher: fields.publisher,
        volume: fields.volume,
        issue: fields.number,
        pages: fields.pages,
        doi: fields.doi,
        url: fields.url,
        source: 'BibTeX import',
        isPreprint: match[1]!.toLowerCase() === 'preprint',
      }),
    )
  }
  return out
}

export function parseRis(text: string): CitationRecord[] {
  const groups = text
    .split(/^ER\s+-\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
  return groups.map((group) => {
    const fields = new Map<string, string[]>()
    for (const line of group.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9]{2})\s+-\s*(.*)$/)
      if (m) fields.set(m[1]!, [...(fields.get(m[1]!) || []), clean(m[2])])
    }
    const authors = (fields.get('AU') || fields.get('A1') || []).map((name) => {
      const [family, ...given] = name.split(',').map(clean)
      return given.length ? { family, given: given.join(' ') } : { literal: name }
    })
    const ty = fields.get('TY')?.[0]?.toUpperCase()
    return normalizeRecord({
      type:
        ty === 'JOUR'
          ? 'article-journal'
          : ty === 'BOOK'
            ? 'book'
            : ty === 'CONF'
              ? 'paper-conference'
              : ty === 'THES'
                ? 'thesis'
                : 'other',
      title: fields.get('TI')?.[0] || fields.get('T1')?.[0],
      authors,
      year: Number((fields.get('PY')?.[0] || fields.get('Y1')?.[0] || '').slice(0, 4)) || undefined,
      containerTitle: fields.get('JO')?.[0] || fields.get('JF')?.[0] || fields.get('T2')?.[0],
      volume: fields.get('VL')?.[0],
      issue: fields.get('IS')?.[0],
      pages: [fields.get('SP')?.[0], fields.get('EP')?.[0]].filter(Boolean).join('-'),
      doi: fields.get('DO')?.[0],
      url: fields.get('UR')?.[0],
      abstract: fields.get('AB')?.[0],
      source: 'RIS import',
      isPreprint: false,
    })
  })
}

export function parseCslJson(text: string): CitationRecord[] {
  const parsed: unknown = JSON.parse(text)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((raw) => {
    const item = raw as Record<string, any>
    return normalizeRecord({
      citationKey: item.id,
      type: TYPE_MAP[item.type] || 'other',
      title: item.title,
      authors: (item.author || []).map((a: any) => ({
        family: a.family,
        given: a.given,
        literal: a.literal,
      })),
      year: Number(item.issued?.['date-parts']?.[0]?.[0]) || undefined,
      containerTitle: item['container-title'],
      volume: item.volume,
      issue: item.issue,
      pages: item.page,
      publisher: item.publisher,
      doi: item.DOI,
      url: item.URL,
      abstract: item.abstract,
      source: 'CSL-JSON import',
      isPreprint: item.type === 'preprint',
    })
  })
}

export function parseImport(
  text: string,
  format: 'auto' | 'bibtex' | 'ris' | 'csl-json' = 'auto',
): CitationRecord[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (format === 'bibtex' || (format === 'auto' && trimmed.startsWith('@')))
    return parseBibTeX(trimmed)
  if (format === 'ris' || (format === 'auto' && /^TY\s+-/m.test(trimmed))) return parseRis(trimmed)
  return parseCslJson(trimmed)
}

export function exportBibTeX(records: CitationRecord[]): string {
  return records
    .map(
      (r) =>
        `@${r.type === 'paper-conference' ? 'inproceedings' : r.type === 'book' ? 'book' : 'article'}{${r.citationKey},\n  title = {${r.title}},\n  author = {${r.authors.map((a) => authorName(a)).join(' and ')}},\n  year = {${r.year || ''}},${r.containerTitle ? `\n  journal = {${r.containerTitle}},` : ''}${r.doi ? `\n  doi = {${r.doi}},` : ''}${r.url ? `\n  url = {${r.url}},` : ''}\n}`,
    )
    .join('\n\n')
}

export function exportCslJson(records: CitationRecord[]): string {
  return JSON.stringify(
    records.map((r) => ({
      id: r.citationKey,
      type: r.type,
      title: r.title,
      author: r.authors,
      issued: { 'date-parts': [[r.year || 0]] },
      'container-title': r.containerTitle,
      volume: r.volume,
      issue: r.issue,
      page: r.pages,
      publisher: r.publisher,
      DOI: r.doi,
      URL: r.url,
    })),
    null,
    2,
  )
}
