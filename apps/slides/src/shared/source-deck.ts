export interface SourceDeckRequest {
  name: string
  pagesHtml: string[]
  expectedRevision: string | null
}
export type SourceDeckResult =
  | {
      ok: true
      revision?: string
      path?: string
      sourcePath?: string
      pagesHtml?: string[]
      pages?: number
      dataUrl?: string
    }
  | { ok: false; error: string }
