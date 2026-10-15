export interface PdfEngineProgress {
  requestId: string
  message: string
}
export interface PdfTranslationOptions {
  sourceLanguage: string
  targetLanguage: string
  pages?: string
  font?: string
  threads: number
  formulaFont?: string
  formulaCharacters?: string
  ignoreCache?: boolean
  skipSubsetFonts?: boolean
}
export interface PdfEngineTool {
  name: string
  title?: string
  description: string
  inputSchema: {
    properties?: Record<
      string,
      { type?: string; description?: string; enum?: unknown[]; default?: unknown }
    >
    required?: string[]
  }
  annotations?: { readOnlyHint?: boolean }
}
export interface PdfEngineContent {
  type: string
  text?: string
  data?: string
  mimeType?: string
}
export interface PdfEngineResult {
  content: PdfEngineContent[]
  isError?: boolean
}
export interface PdfEnginesApi {
  engineCancel(requestId: string): Promise<void>
  onEngineProgress(handler: (progress: PdfEngineProgress) => void): () => void
  translateDocument(
    path: string,
    options: PdfTranslationOptions,
    requestId: string,
  ): Promise<string[]>
  craftOpen(
    path: string,
    requestId: string,
    password?: string,
  ): Promise<{ tools: PdfEngineTool[]; result: PdfEngineResult }>
  craftCall(tool: string, args: Record<string, unknown>): Promise<PdfEngineResult>
  craftSave(): Promise<string | null>
  craftPickPath(kind: 'file' | 'directory' | 'save'): Promise<string | null>
  craftFiles(): Promise<{ name: string; path: string }[]>
  craftExport(path: string): Promise<string | null>
  craftClose(): Promise<void>
}
