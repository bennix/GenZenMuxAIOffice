import { authorName } from './core'
import { searchScholarly } from './search'
import type { CitationRecord, SearchSource } from './types'

const NOVELTY_SOURCES: SearchSource[] = [
  'openalex',
  'crossref',
  'semantic-scholar',
  'pubmed',
  'arxiv',
]

export interface NoveltySearchResult {
  queries: string[]
  records: CitationRecord[]
  errors: string[]
  evidence: string
}

export function parseNoveltyQueries(raw: string, fallback: string): string[] {
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let values: unknown
  try {
    const parsed = JSON.parse(unfenced) as unknown
    values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? (parsed as { queries?: unknown }).queries
        : null
  } catch {
    values = unfenced.split(/\r?\n|;/).map((line) => line.replace(/^[-*\d.)\s]+/, ''))
  }
  const queries = (Array.isArray(values) ? values : [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 4)
  if (!queries.length && fallback.trim()) queries.push(fallback.trim().slice(0, 240))
  return [...new Set(queries)].slice(0, 3)
}

function recordLine(record: CitationRecord, index: number): string {
  const authors = record.authors
    .slice(0, 3)
    .map((author) => authorName(author))
    .filter(Boolean)
  const locator = record.doi
    ? `https://doi.org/${record.doi}`
    : record.url || (record.arxivId ? `https://arxiv.org/abs/${record.arxivId}` : '')
  const status = record.isPreprint
    ? 'preprint; not peer reviewed'
    : record.peerReviewed === false
      ? 'peer-review status unknown/not confirmed'
      : 'published/indexed record'
  const abstract = record.abstract ? ` Abstract: ${record.abstract.slice(0, 700)}` : ''
  return `${index + 1}. ${record.title} (${record.year ?? 'n.d.'}). ${authors.join(', ') || 'Authors unavailable'}. ${record.containerTitle ?? record.source}. [${status}]${locator ? ` ${locator}` : ''}${abstract}`
}

export function formatNoveltyEvidence(
  queries: string[],
  records: CitationRecord[],
  errors: string[] = [],
): string {
  const lines = [
    'LIVE SCHOLARLY METADATA EVIDENCE FOR NOVELTY REVIEW',
    `Search queries: ${queries.join(' | ') || 'none'}`,
    'Treat these records as discovery evidence, not proof of novelty. Verify title, year, DOI/URL, peer-review status, and claim overlap. Never cite a record that is not listed below.',
    records.length
      ? records.slice(0, 15).map(recordLine).join('\n')
      : 'No matching scholarly metadata record was retrieved. State that novelty could not be externally verified; absence from these results is not evidence of novelty and must not be treated as proof that the work is novel.',
  ]
  if (errors.length)
    lines.push(
      `Partial search failures: ${errors.slice(0, 5).join(' | ')}. Disclose this limitation.`,
    )
  return lines.join('\n\n')
}

export async function searchNoveltyEvidence(
  queries: string[],
  signal?: AbortSignal,
): Promise<NoveltySearchResult> {
  const settled = await Promise.all(
    queries.map((query) => searchScholarly(query, { sources: NOVELTY_SOURCES, limit: 4, signal })),
  )
  const byId = new Map<string, CitationRecord>()
  for (const result of settled) for (const record of result.records) byId.set(record.id, record)
  const records = [...byId.values()].slice(0, 15)
  const errors = settled.flatMap((result) => result.errors)
  return { queries, records, errors, evidence: formatNoveltyEvidence(queries, records, errors) }
}
