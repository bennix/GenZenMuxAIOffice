export const DOCUMENT_DROP_CHANNEL = 'genoffice:open-dropped-documents'

const DOCUMENT_EXTENSION = /\.(?:docx?|xlsx?|csv|pptx|pdf|md|markdown)$/i

export function isDroppedOfficeDocument(path: string): boolean {
  return path.length > 0 && path.length <= 4096 && DOCUMENT_EXTENSION.test(path)
}

export function droppedOfficeDocumentPaths(
  files: ArrayLike<File>,
  getPathForFile: (file: File) => string,
  limit = 10,
): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!file) continue
    let path: string
    try {
      path = getPathForFile(file)
    } catch {
      continue
    }
    if (!isDroppedOfficeDocument(path) || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
    if (paths.length >= limit) break
  }
  return paths
}

/**
 * Open office documents dropped anywhere in a renderer. Non-document drops
 * (especially images handled by Word/PPT/Markdown) are deliberately left to
 * the editor's own drop handlers.
 */
export function installDocumentDropBridge(options: {
  getPathForFile(file: File): string
  openPaths(paths: readonly string[]): void
  target?: Window
}): () => void {
  const target = options.target ?? window
  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return
    // Required by Chromium for a subsequent drop event. Existing editor
    // handlers still receive dragover and retain their own visual feedback.
    event.preventDefault()
  }
  const onDrop = (event: DragEvent): void => {
    if (!event.dataTransfer) return
    const paths = droppedOfficeDocumentPaths(event.dataTransfer.files, options.getPathForFile)
    if (paths.length === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    options.openPaths(paths)
  }
  target.addEventListener('dragover', onDragOver, true)
  target.addEventListener('drop', onDrop, true)
  return () => {
    target.removeEventListener('dragover', onDragOver, true)
    target.removeEventListener('drop', onDrop, true)
  }
}
