import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { useI18n } from './i18n/locale'
import {
  CitationManager,
  parseImport,
  type CitationRecord,
  type CitationStyle,
} from '@genoffice/citations'
import {
  parseDocText,
  serializeDocText,
  stripLegacyFencedDivs,
  repairOverescapedMarkdown,
  type DocEnvelope,
} from './markdown/docText'
import { buildExtensions } from './editor/extensions'
import { buildSlashItems } from './editor/slashCommand'
import type { SlashController, SlashMenuState } from './editor/slashCommand'
import { setImageBaseDir } from './editor/localImage'
import { Ribbon } from './components/Ribbon'
import { SlashMenu, type SlashMenuHandle } from './components/SlashMenu'
import { TableMenu } from './components/TableMenu'
import { EquationDialog, type MarkdownEquationTarget } from './components/EquationDialog'
import { MermaidDialog } from './components/MermaidDialog'
import { WechatExportDialog } from './components/WechatExportDialog'
import { AiReviewCommitteeModal } from './components/AiReviewCommitteeModal'
import { AiPanel, ZenMuxMark, type AiPreset, type MarkdownAiDeps } from './ai/AiPanel'
import { DOCX_MAX_IMAGE_PX, exportDocxBytes } from './export/docxExport'
import { buildPrintHtml } from './export/printHtml'
import { resolveImageSrc } from './editor/localImage'
import { citationToken, syncBibliography } from './markdown/citations'
import type { ExportFormat, SaveMode } from '../shared/ipc'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const EMPTY_ENVELOPE: DocEnvelope = {
  frontmatter: '',
  body: '',
  eol: '\n',
  trailingNewline: true,
  bom: false,
}

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i > 0 ? path.slice(0, i) : path
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Measure a document image via the DOM (the editor already displays it) */
function measureImage(displaySrc: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolvePromise) => {
    const img = new Image()
    img.onload = () => resolvePromise({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolvePromise(null)
    img.src = displaySrc
  })
}

/** File name for an AI-generated untitled document: first heading, else first words */
export function deriveAutoFileName(editor: Editor): string {
  const doc = editor.state.doc
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (node.type.name === 'heading') return text.slice(0, 60)
    return text.split(' ').slice(0, 8).join(' ').slice(0, 60)
  }
  return ''
}

export default function App() {
  const { t } = useI18n()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [slashState, setSlashState] = useState<SlashMenuState | null>(null)
  const [aiOpen, setAiOpen] = useState(true)
  const [aiPreset, setAiPreset] = useState<AiPreset | null>(null)
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('mdapp.autoSave') === '1')
  const [citationsOpen, setCitationsOpen] = useState(false)
  const [citationInitialTab, setCitationInitialTab] = useState<'search' | 'library'>('search')
  const [equationOpen, setEquationOpen] = useState(false)
  const [equationTarget, setEquationTarget] = useState<MarkdownEquationTarget | undefined>()
  const [mermaidOpen, setMermaidOpen] = useState(false)
  const [mermaidTab, setMermaidTab] = useState<'pretty' | 'editorial' | 'wechat'>('pretty')
  const [wechatOpen, setWechatOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const citationRecordsRef = useRef(new Map<string, CitationRecord>())
  const citationStyleRef = useRef<CitationStyle>('gb7714')

  const statusRef = useRef<LoadStatus>('loading')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const envelopeRef = useRef<DocEnvelope>(EMPTY_ENVELOPE)
  const editorRef = useRef<Editor | null>(null)
  const filePathRef = useRef<string | null>(null)
  const slashMenuRef = useRef<SlashMenuHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const saveUntitledRef = useRef<(() => Promise<boolean>) | null>(null)

  const markDirty = useCallback(() => {
    if (statusRef.current !== 'ready' || dirtyRef.current) return
    dirtyRef.current = true
    setDirty(true)
    setSaveState('idle')
    window.markdownApi.setDirty(true)
  }, [])

  const insertImage = useCallback(() => {
    void (async () => {
      if (!filePathRef.current) {
        const saved = await saveUntitledRef.current?.()
        if (!saved) return
      }
      const relPath = await window.markdownApi.pickImage()
      const current = editorRef.current
      if (relPath && current) current.chain().focus().setImage({ src: relPath }).run()
    })()
  }, [])

  const extensions = useMemo(() => {
    const controller: SlashController = {
      onOpen: setSlashState,
      onUpdate: setSlashState,
      onKeyDown: (event) => slashMenuRef.current?.handleKey(event) ?? false,
      onClose: () => setSlashState(null),
    }
    return buildExtensions({
      slashController: controller,
      slashItems: () =>
        buildSlashItems({
          insertImage,
          insertMermaid: () => {
            setMermaidTab('pretty')
            setMermaidOpen(true)
          },
          openWechat: () => setWechatOpen(true),
          openCitations: () => {
            setCitationInitialTab('library')
            setCitationsOpen(true)
          },
        }),
    })
  }, [insertImage])

  const editor = useEditor({
    extensions,
    content: '',
    autofocus: true,
    editorProps: {
      attributes: { class: 'doc-editor' },
      handlePaste: (_view, event) => {
        // A Markdown editor should interpret pasted plain text as Markdown.
        // ProseMirror's default paste path treats `$F_1$` as literal text,
        // which is why standard math delimiters were visible in the document.
        // Keep file/image-only clipboard events on their native path.
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!text) return false
        const current = editorRef.current
        if (!current) return false
        const markdown = repairOverescapedMarkdown(stripLegacyFencedDivs(text))
        current.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
        return true
      },
    },
    // uiOnly transactions (toggle fold state) never reach the file — not dirty
    onUpdate: ({ transaction }) => {
      if (!transaction.getMeta('uiOnly')) markDirty()
    },
  })
  editorRef.current = editor
  filePathRef.current = filePath

  useEffect(
    () =>
      window.markdownApi.onConnectReceive(({ text }) => {
        const current = editorRef.current
        if (!current) return
        // @Connect receives the source form of another editor's AI reply.
        // Normalize it through the same path as native Markdown AI tools so
        // model-written bare LaTeX (for example `4\\text{ kg}`) becomes an
        // editable equation instead of visible source text.
        const markdown = repairOverescapedMarkdown(stripLegacyFencedDivs(text))
        current.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
        markDirty()
      }),
    [markDirty],
  )

  useEffect(() => {
    setImageBaseDir(filePath ? dirOf(filePath) : null)
  }, [filePath])

  useEffect(() => {
    const editEquation = (event: Event) => {
      setEquationTarget((event as CustomEvent<MarkdownEquationTarget>).detail)
      setEquationOpen(true)
    }
    window.addEventListener('markdown:edit-equation', editEquation)
    return () => window.removeEventListener('markdown:edit-equation', editEquation)
  }, [])

  useEffect(() => {
    if (!editor) return
    let cancelled = false
    void (async () => {
      try {
        const path = await window.markdownApi.consumePending()
        if (cancelled) return
        if (path) {
          const raw = await window.markdownApi.readFile(path)
          if (cancelled) return
          const envelope = parseDocText(raw)
          envelopeRef.current = envelope
          setImageBaseDir(dirOf(path))
          // the initial load must not be undoable — Cmd+Z right after opening
          // would otherwise blank the document (and Cmd+S overwrite the file)
          editor
            .chain()
            .setMeta('addToHistory', false)
            .setContent(repairOverescapedMarkdown(stripLegacyFencedDivs(envelope.body)), {
              contentType: 'markdown',
            })
            .run()
          setFilePath(path)
          const bibText = await window.markdownApi.readBibliography()
          if (bibText) {
            for (const record of parseImport(bibText, 'bibtex')) {
              citationRecordsRef.current.set(record.citationKey, record)
            }
          }
        } else {
          envelopeRef.current = { ...EMPTY_ENVELOPE }
        }
        statusRef.current = 'ready'
        setStatus('ready')
      } catch (err) {
        console.error('[markdown] load failed:', err)
        if (!cancelled) {
          statusRef.current = 'error'
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editor])

  /** Serialize and write to disk; false when canceled/failed (caller keeps the tab open) */
  const doSave = useCallback(async (mode: SaveMode, suggestedName?: string): Promise<boolean> => {
    const current = editorRef.current
    if (!current || statusRef.current !== 'ready' || savingRef.current) return false
    savingRef.current = true
    setSaveState('saving')
    try {
      // edits landing while the write is in flight (AI streaming, fast typing)
      // must keep the document dirty — compare doc identity after the await
      const language = navigator.language.startsWith('zh') ? 'zh' : 'en'
      const synced = syncBibliography(
        current.getMarkdown(),
        citationRecordsRef.current,
        citationStyleRef.current,
        language,
      )
      if (synced.markdown.trimEnd() !== current.getMarkdown().trimEnd()) {
        current
          .chain()
          .setMeta('addToHistory', false)
          .setContent(synced.markdown, { contentType: 'markdown' })
          .run()
      }
      const docAtSave = current.state.doc
      const fmAtSave = envelopeRef.current.frontmatter
      const body = current.getMarkdown()
      const text = serializeDocText(envelopeRef.current, body)
      const finalCitations = syncBibliography(
        body,
        citationRecordsRef.current,
        citationStyleRef.current,
        language,
      )
      const result = await window.markdownApi.save({
        text,
        mode,
        suggestedName,
        bibText: citationRecordsRef.current.size ? finalCitations.bibTeX : undefined,
      })
      if (result.ok && 'path' in result) {
        setFilePath(result.path)
        const unchanged =
          editorRef.current?.state.doc === docAtSave && envelopeRef.current.frontmatter === fmAtSave
        if (unchanged) {
          dirtyRef.current = false
          setDirty(false)
          window.markdownApi.setDirty(false)
          setSaveState('saved')
        } else {
          // the main process cleared its dirty flag on write — re-assert it
          dirtyRef.current = true
          setDirty(true)
          window.markdownApi.setDirty(true)
          setSaveState('idle')
        }
        return true
      }
      setSaveState(result.ok ? 'idle' : 'failed')
      return false
    } catch (err) {
      console.error('[markdown] save failed:', err)
      setSaveState('failed')
      return false
    } finally {
      savingRef.current = false
    }
  }, [])
  saveUntitledRef.current = () => doSave('save')

  const runExport = useCallback(async (format: ExportFormat) => {
    const current = editorRef.current
    if (!current || statusRef.current !== 'ready') return
    const suggestedName =
      (filePathRef.current
        ? filePathRef.current.replace(/^.*[/\\]/, '').replace(/\.(md|markdown)$/i, '')
        : deriveAutoFileName(current)) || 'Untitled'
    try {
      if (format === 'pdf' || format === 'print' || format === 'print-preview') {
        const html = buildPrintHtml(current.view.dom, suggestedName)
        if (format !== 'pdf') {
          const result = await window.markdownApi.print({
            html,
            suggestedName,
            mode: format === 'print' ? 'print' : 'preview',
          })
          if (!result.ok) console.error('[markdown] print failed:', result.error)
          return
        }
        const result = await window.markdownApi.exportPdf({ html, suggestedName })
        if (!result.ok) console.error('[markdown] pdf export failed:', result.error)
        return
      }
      const loadImage = async (src: string) => {
        const data = await window.markdownApi.readImage(src)
        if (!data) return null
        const dims = await measureImage(resolveImageSrc(src))
        let width = dims?.width || 400
        let height = dims?.height || 300
        if (width > DOCX_MAX_IMAGE_PX) {
          height = Math.round((height * DOCX_MAX_IMAGE_PX) / width)
          width = DOCX_MAX_IMAGE_PX
        }
        return { base64: data.base64, mime: data.mime, widthPx: width, heightPx: height }
      }
      const bytes = await exportDocxBytes(current.getJSON(), loadImage)
      const result = await window.markdownApi.exportDocx({
        base64: bytesToBase64(bytes),
        suggestedName,
        mode: format === 'docs' ? 'openInDocs' : 'dialog',
      })
      if (!result.ok) console.error('[markdown] docx export failed:', result.error)
    } catch (err) {
      console.error('[markdown] export failed:', err)
    }
  }, [])

  useEffect(() => {
    const offExport = window.markdownApi.onExportRequest((format) => void runExport(format))
    return offExport
  }, [runExport])

  useEffect(() => {
    const offSave = window.markdownApi.onSaveRequest(
      (mode) => void doSave(mode).then((ok) => window.markdownApi.sendSaveRequestAck(ok)),
    )
    const offClose = window.markdownApi.onCloseSaveRequest(() => {
      void doSave('save').then((ok) => window.markdownApi.sendCloseSaveResult(ok))
    })
    const offRenamed = window.markdownApi.onFileRenamed((newPath) => setFilePath(newPath))
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void doSave(event.shiftKey ? 'saveAs' : 'save')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      offSave()
      offClose()
      offRenamed()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [doSave])

  useEffect(() => {
    localStorage.setItem('mdapp.autoSave', autoSave ? '1' : '0')
  }, [autoSave])

  // autosave: every 30s and on window blur, silently persist pending changes
  // (same policy as the docs app; untitled documents are skipped — the first
  // save must go through the explicit save path that names the file)
  useEffect(() => {
    if (!autoSave || !filePath) return
    const tick = () => {
      if (!dirtyRef.current) return
      if (editorRef.current?.view.composing) return // don't interrupt IME input
      void doSave('save')
    }
    const id = window.setInterval(tick, 30_000)
    window.addEventListener('blur', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('blur', tick)
    }
  }, [autoSave, filePath, doSave])

  const aiDeps: MarkdownAiDeps = {
    getEditor: () => editorRef.current,
    getSnapshot: () => editorRef.current?.getMarkdown() ?? '',
    restoreSnapshot: (markdown) => {
      const current = editorRef.current
      if (!current) return
      current.commands.setContent(repairOverescapedMarkdown(markdown), {
        contentType: 'markdown',
      })
      markDirty()
    },
    onRunDone: (mutated) => {
      // AI wrote into a never-saved document → name it from the content and save silently
      if (!mutated || filePathRef.current || !editorRef.current) return
      const name = deriveAutoFileName(editorRef.current)
      if (name) void doSave('save', name)
    },
  }

  const fileName = filePath ? filePath.replace(/^.*[/\\]/, '') : null
  const statusText =
    saveState === 'saving'
      ? t('saving')
      : saveState === 'failed'
        ? t('saveFailed')
        : dirty
          ? t('unsaved')
          : saveState === 'saved'
            ? t('savedOk')
            : ''

  if (status === 'error') {
    return (
      <div className="app">
        <div className="center-note">{t('loadError')}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Ribbon
        editor={editor}
        disabled={status !== 'ready'}
        dirty={dirty}
        onSave={() => void doSave('save')}
        autoSave={autoSave}
        onToggleAutoSave={setAutoSave}
        imageEnabled
        onInsertImage={insertImage}
        onInsertEquation={() => {
          setEquationTarget(undefined)
          setEquationOpen(true)
        }}
        onInsertMermaid={() => {
          setMermaidTab('pretty')
          setMermaidOpen(true)
        }}
        onOpenWechat={() => setWechatOpen(true)}
        onOpenCitations={() => {
          setCitationInitialTab('search')
          setCitationsOpen(true)
        }}
        onReview={() => setReviewOpen(true)}
        onTranslate={(language) => {
          const selection = editor && editor.state.selection.from !== editor.state.selection.to
          const target = language === 'zh' ? '简体中文' : 'English'
          const scope = selection ? '当前选中的内容' : '全文'
          setAiOpen(true)
          setAiPreset((prev) => ({
            text: `将${scope}翻译为${target}。直接在文档中替换原内容，保持 Markdown 标题、列表、表格、链接、图片、LaTeX 公式和 Mermaid fenced code 的结构与语义不变；不要翻译代码、URL、公式命令或 Mermaid 语法。`,
            nonce: (prev?.nonce ?? 0) + 1,
          }))
        }}
        aiOpen={aiOpen}
        onToggleAi={() => setAiOpen((v) => !v)}
        onAiPreset={(text) => {
          setAiOpen(true)
          setAiPreset((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }))
        }}
      />
      {status === 'loading' && <div className="center-note">{t('loading')}</div>}
      <div className="app-main" style={status === 'ready' ? undefined : { display: 'none' }}>
        <div className={`ai-dock${aiOpen ? '' : ' collapsed'}`}>
          {!aiOpen && (
            <button
              className="ai-rail"
              data-tip={t('aiOpenAssistant')}
              aria-label={t('aiOpenAssistant')}
              onClick={() => setAiOpen(true)}
            >
              <ZenMuxMark size={22} />
            </button>
          )}
          {/* mounted only after the file is loaded so chat history resolves against the real path */}
          {status === 'ready' && (
            <AiPanel
              deps={aiDeps}
              filePath={filePath}
              preset={aiPreset}
              onCollapse={() => setAiOpen(false)}
            />
          )}
        </div>
        <div className="app-content">
          <div className="editor-scroll" ref={scrollRef}>
            <div className="doc-page">
              <EditorContent editor={editor} />
            </div>
          </div>
          <footer className="status-bar">
            <div className="status-left">
              {fileName && <span className="status-item status-file">{fileName}</span>}
            </div>
            <div className="status-right">
              {statusText && (
                <span className={`status-save status-${saveState}`}>{statusText}</span>
              )}
            </div>
          </footer>
        </div>
      </div>
      <SlashMenu ref={slashMenuRef} state={slashState} onDismiss={() => setSlashState(null)} />
      <TableMenu editor={editor} scrollRef={scrollRef} />
      {equationOpen && editor && (
        <EquationDialog
          editor={editor}
          target={equationTarget}
          onClose={() => {
            setEquationOpen(false)
            setEquationTarget(undefined)
          }}
        />
      )}
      {mermaidOpen && editor && (
        <MermaidDialog
          editor={editor}
          initialTab={mermaidTab}
          onClose={() => setMermaidOpen(false)}
        />
      )}
      {wechatOpen && editor && (
        <WechatExportDialog editorRoot={editor.view.dom} onClose={() => setWechatOpen(false)} />
      )}
      {reviewOpen && editor && (
        <AiReviewCommitteeModal editor={editor} onClose={() => setReviewOpen(false)} />
      )}
      {citationsOpen && editor && (
        <CitationManager
          initialTab={citationInitialTab}
          onClose={() => setCitationsOpen(false)}
          onInsertCitation={(record: CitationRecord, _rendered, style) => {
            citationRecordsRef.current.set(record.citationKey, record)
            if (style) citationStyleRef.current = style
            editor.chain().focus().insertContent(citationToken(record)).run()
            const synced = syncBibliography(
              editor.getMarkdown(),
              citationRecordsRef.current,
              citationStyleRef.current,
              navigator.language.startsWith('zh') ? 'zh' : 'en',
            )
            editor
              .chain()
              .setMeta('addToHistory', false)
              .setContent(synced.markdown, { contentType: 'markdown' })
              .run()
            markDirty()
            // Persist the synchronized bibliography immediately. For an
            // untitled document this also assigns its first local path, so the
            // companion .bib exists as soon as the citation is inserted.
            queueMicrotask(() => {
              const suggestedName = deriveAutoFileName(editor) || 'Untitled'
              void doSave('save', suggestedName)
            })
          }}
          onInsertBibliography={(_records, rendered) => {
            const markdown = `\n\n## ${navigator.language.startsWith('zh') ? '参考文献' : 'References'}\n\n${rendered.map((line) => `- ${line}`).join('\n')}\n`
            editor.chain().focus().insertContent(markdown, { contentType: 'markdown' }).run()
            markDirty()
          }}
          aiAssist={async (query) => {
            const settings = await window.markdownApi.getAiSettings()
            const response = await window.markdownApi.aiChat({
              settings,
              system:
                'Expand scholarly queries. Return only one concise search query. Never invent publication metadata.',
              user: `Current date: ${new Date().toISOString().slice(0, 10)}\nQuery: ${query}`,
            })
            if (!response.ok) throw new Error(response.error || 'ZenMux request failed')
            return response.content || query
          }}
        />
      )}
    </div>
  )
}
