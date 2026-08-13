import { dedupeRecords, normalizeRecord } from './core'
import type { CitationAuthor, CitationRecord, SearchSource } from './types'

export interface SearchOptions {
  sources?: SearchSource[]
  limit?: number
  signal?: AbortSignal
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

function openAlexAbstract(index: unknown): string | undefined {
  if (!index || typeof index !== 'object') return undefined
  const words: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (Array.isArray(positions))
      for (const pos of positions) if (Number.isFinite(pos)) words.push([Number(pos), word])
  }
  return (
    words
      .sort((a, b) => a[0] - b[0])
      .map(([, word]) => word)
      .join(' ') || undefined
  )
}

async function json(url: string, signal?: AbortSignal): Promise<any> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GenZenMuxAIOffice/0.6 (scholarly metadata search)',
    },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function searchOpenAlex(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const data = await json(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,doi,title,publication_year,type,authorships,primary_location,open_access,biblio,abstract_inverted_index`,
    signal,
  )
  return (data.results || []).map((w: any) =>
    normalizeRecord({
      type:
        w.type === 'book'
          ? 'book'
          : w.type === 'preprint'
            ? 'preprint'
            : w.type === 'proceedings-article'
              ? 'paper-conference'
              : 'article-journal',
      title: w.title,
      authors: (w.authorships || []).map((a: any) => ({ family: a.author?.display_name })),
      year: w.publication_year,
      containerTitle: w.primary_location?.source?.display_name,
      volume: w.biblio?.volume,
      issue: w.biblio?.issue,
      pages: [w.biblio?.first_page, w.biblio?.last_page].filter(Boolean).join('-'),
      doi: w.doi,
      url: w.primary_location?.landing_page_url || w.id,
      pdfUrl: w.primary_location?.pdf_url,
      abstract: openAlexAbstract(w.abstract_inverted_index),
      source: 'OpenAlex',
      isPreprint: w.type === 'preprint',
      peerReviewed: w.type !== 'preprint',
      openAccess: w.open_access?.is_oa,
    }),
  )
}

async function searchCrossref(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const data = await json(
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,published,container-title,volume,issue,page,publisher,URL,type`,
    signal,
  )
  return (data.message?.items || []).map((w: any) =>
    normalizeRecord({
      type:
        w.type === 'book'
          ? 'book'
          : w.type === 'proceedings-article'
            ? 'paper-conference'
            : w.type === 'posted-content'
              ? 'preprint'
              : 'article-journal',
      title: w.title?.[0],
      authors: (w.author || []).map((a: any) => ({ family: a.family, given: a.given })),
      year: w.published?.['date-parts']?.[0]?.[0],
      containerTitle: w['container-title']?.[0],
      volume: w.volume,
      issue: w.issue,
      pages: w.page,
      publisher: w.publisher,
      doi: w.DOI,
      url: w.URL,
      source: 'Crossref',
      isPreprint: w.type === 'posted-content',
      peerReviewed: w.type !== 'posted-content',
    }),
  )
}

async function searchSemanticScholar(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const fields =
    'title,authors,year,venue,journal,externalIds,url,abstract,isOpenAccess,openAccessPdf,publicationTypes'
  const data = await json(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
    signal,
  )
  return (data.data || []).map((w: any) =>
    normalizeRecord({
      type: w.publicationTypes?.includes('Conference') ? 'paper-conference' : 'article-journal',
      title: w.title,
      authors: (w.authors || []).map((a: any) => ({ literal: a.name })),
      year: w.year,
      containerTitle: w.journal?.name || w.venue,
      volume: w.journal?.volume,
      pages: w.journal?.pages,
      doi: w.externalIds?.DOI,
      pmid: w.externalIds?.PubMed,
      arxivId: w.externalIds?.ArXiv,
      url: w.url,
      pdfUrl: w.openAccessPdf?.url,
      abstract: w.abstract,
      source: 'Semantic Scholar',
      isPreprint: !!w.externalIds?.ArXiv && !w.externalIds?.DOI,
      openAccess: w.isOpenAccess,
    }),
  )
}

async function searchEuropePmc(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const data = await json(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${limit}&resultType=core`,
    signal,
  )
  return (data.resultList?.result || []).map((w: any) =>
    normalizeRecord({
      type: 'article-journal',
      title: w.title,
      authors: String(w.authorString || '')
        .split(',')
        .filter(Boolean)
        .map((literal) => ({ literal: literal.trim() })),
      year: Number(w.pubYear) || undefined,
      containerTitle: w.journalTitle,
      volume: w.journalVolume,
      issue: w.issue,
      pages: w.pageInfo,
      doi: w.doi,
      pmid: w.pmid,
      url: w.doi
        ? `https://doi.org/${w.doi}`
        : w.pmid
          ? `https://europepmc.org/article/MED/${w.pmid}`
          : undefined,
      abstract: w.abstractText,
      source: 'Europe PMC',
      isPreprint: w.pubTypeList?.pubType?.includes('preprint') || false,
      peerReviewed: !w.pubTypeList?.pubType?.includes('preprint'),
      openAccess: w.isOpenAccess === 'Y',
      pdfUrl: w.fullTextUrlList?.fullTextUrl?.find((u: any) => u.documentStyle === 'pdf')?.url,
    }),
  )
}

async function searchPubMed(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const found = await json(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&term=${encodeURIComponent(query)}`,
    signal,
  )
  const ids: string[] = found.esearchresult?.idlist || []
  if (!ids.length) return []
  const summaries = await json(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`,
    signal,
  )
  return ids.flatMap((pmid) => {
    const item = summaries.result?.[pmid]
    if (!item) return []
    const articleIds: Array<{ idtype?: string; value?: string }> = item.articleids || []
    const doi = articleIds.find((id) => id.idtype === 'doi')?.value
    const pmc = articleIds.find((id) => id.idtype === 'pmc')?.value
    const year =
      Number(String(item.pubdate || item.epubdate || '').match(/\d{4}/)?.[0]) || undefined
    return [
      normalizeRecord({
        type: 'article-journal',
        title: item.title,
        authors: (item.authors || []).map((author: any) => ({ literal: author.name })),
        year,
        containerTitle: item.fulljournalname || item.source,
        volume: item.volume,
        issue: item.issue,
        pages: item.pages,
        doi,
        pmid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        pdfUrl: pmc ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmc}/` : undefined,
        source: 'PubMed',
        isPreprint: false,
        peerReviewed: true,
        openAccess: !!pmc,
      }),
    ]
  })
}

function xmlValue(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match
    ? match[1]!
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
    : undefined
}

async function searchArxiv(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<CitationRecord[]> {
  const response = await fetch(
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`,
    { signal },
  )
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const xml = await response.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => {
    const block = m[1]!
    const id = xmlValue(block, 'id') || ''
    const authors = [
      ...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi),
    ].map((a) => ({ literal: a[1]!.trim() }))
    return normalizeRecord({
      type: 'preprint',
      title: xmlValue(block, 'title'),
      authors,
      year: Number(xmlValue(block, 'published')?.slice(0, 4)) || undefined,
      arxivId: id.split('/abs/')[1],
      url: id,
      pdfUrl: id.replace('/abs/', '/pdf/'),
      abstract: xmlValue(block, 'summary'),
      source: 'arXiv',
      isPreprint: true,
      peerReviewed: false,
      openAccess: true,
    })
  })
}

export async function searchScholarly(
  query: string,
  options: SearchOptions = {},
): Promise<{ records: CitationRecord[]; errors: string[] }> {
  const q = query.trim()
  if (!q) return { records: [], errors: [] }
  const limit = Math.min(Math.max(options.limit || 8, 1), 20)
  const selected: SearchSource[] = options.sources?.length
    ? options.sources
    : ['openalex', 'crossref', 'semantic-scholar', 'pubmed', 'europe-pmc', 'arxiv']
  const adapters: Record<SearchSource, () => Promise<CitationRecord[]>> = {
    openalex: () => searchOpenAlex(q, limit, options.signal),
    crossref: () => searchCrossref(q, limit, options.signal),
    'semantic-scholar': () => searchSemanticScholar(q, limit, options.signal),
    pubmed: () => searchPubMed(q, limit, options.signal),
    'europe-pmc': () => searchEuropePmc(q, limit, options.signal),
    arxiv: () => searchArxiv(q, limit, options.signal),
  }
  const settled = await Promise.allSettled(selected.map((source) => adapters[source]()))
  const records = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  const errors = settled.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          `${selected[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        ]
      : [],
  )
  return { records: dedupeRecords(records), errors }
}
