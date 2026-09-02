declare module 'word-extractor' {
  interface ExtractedDocument {
    getBody(options?: { filterUnicode?: boolean }): string
  }

  export default class WordExtractor {
    extract(path: string): Promise<ExtractedDocument>
  }
}
