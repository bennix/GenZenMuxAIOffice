import { useEffect, useRef, useState } from 'react'
import { ResearchStudio, type ResearchStudioMode } from '@genoffice/ui'
import type { ResearchHit } from '@genoffice/ai-provider/deep-research'
import type { SearchIndex } from './search'

const PDF_TEXT_MAX = 12000

function pdfText(pages: SearchIndex): string {
  return pages
    .map((page, i) => `[Page ${i + 1}]\n${page.text}`)
    .join('\n\n')
    .slice(0, PDF_TEXT_MAX)
}

export function PdfResearchStudio({
  getSearchIndex,
  getDocumentVersion,
  generate,
  search,
  stream,
  onInsert,
  onClose,
}: {
  getSearchIndex: () => Promise<SearchIndex> | null
  getDocumentVersion: () => unknown
  generate: (prompt: { system: string; user: string }) => Promise<string>
  search: (query: string, signal: AbortSignal) => Promise<ResearchHit[]>
  stream: (
    prompt: { system: string; user: string },
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ) => Promise<string>
  onInsert: (text: string) => boolean
  onClose: () => void
}) {
  const [mode, setMode] = useState<ResearchStudioMode>('research')
  const [source, setSource] = useState<string | null>(null)
  const loadingDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let cancel = false
    const pending = getSearchIndex()
    if (!pending) {
      setSource('')
      return
    }
    void pending
      .then((index) => {
        if (!cancel) setSource(pdfText(index))
      })
      .catch(() => {
        if (!cancel) setSource('')
      })
    return () => {
      cancel = true
    }
  }, [getSearchIndex])
  useEffect(() => {
    if (source === null) loadingDialog.current?.showModal()
  }, [source])
  if (source === null) {
    return (
      <dialog
        ref={loadingDialog}
        className="screenwriting-studio"
        aria-label="深度研究"
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
      >
        <p role="status">正在读取 PDF 文本…</p>
        <button onClick={onClose}>返回文档</button>
      </dialog>
    )
  }
  return (
    <ResearchStudio
      mode={mode}
      onMode={setMode}
      initialSource={source}
      getDocumentVersion={getDocumentVersion}
      generate={generate}
      search={search}
      stream={stream}
      insertLabel="记到当前页"
      connect={window.pdfApi}
      onInsert={onInsert}
      onClose={onClose}
    />
  )
}
