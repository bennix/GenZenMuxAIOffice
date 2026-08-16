declare module 'word-extractor' {
  interface ExtractOptions {
    filterUnicode?: boolean
  }

  interface ExtractedWordDocument {
    getBody(options?: ExtractOptions): string
  }

  export default class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedWordDocument>
  }
}
