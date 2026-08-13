export type CitationType =
  | 'article-journal'
  | 'book'
  | 'paper-conference'
  | 'report'
  | 'thesis'
  | 'webpage'
  | 'preprint'
  | 'other'

export interface CitationAuthor {
  family?: string
  given?: string
  literal?: string
}

export interface CitationRecord {
  id: string
  citationKey: string
  type: CitationType
  title: string
  authors: CitationAuthor[]
  year?: number
  containerTitle?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  doi?: string
  pmid?: string
  arxivId?: string
  url?: string
  abstract?: string
  source: string
  isPreprint: boolean
  peerReviewed?: boolean
  openAccess?: boolean
  pdfUrl?: string
}

export type CitationStyle = 'gb7714' | 'apa7' | 'ieee' | 'nature' | 'vancouver'
export type SearchSource =
  'openalex' | 'crossref' | 'semantic-scholar' | 'pubmed' | 'europe-pmc' | 'arxiv'
