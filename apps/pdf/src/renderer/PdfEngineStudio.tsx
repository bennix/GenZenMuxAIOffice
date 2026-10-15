import { EDIT_FONTS } from '../shared/ipc'
import { useEffect, useRef, useState } from 'react'
import type {
  PdfEngineContent,
  PdfEngineResult,
  PdfEngineTool,
  PdfTranslationOptions,
} from '../shared/pdf-engines'

const dataOf = (result: PdfEngineResult): Record<string, unknown> => {
  const text = result.content.find((item) => item.type === 'text')?.text
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}
interface Paragraph {
  paragraph: number
  editor_text: string
  text: string
  font: string
  size: number
  rect: number[]
}
interface Font {
  resource: string
  font: string
  preview_only?: boolean
}
export function PdfEngineStudio({
  mode,
  path,
  initialPage,
  zh,
  password,
  onOpen,
  onClose,
}: {
  mode: 'translation' | 'craft'
  path: string
  initialPage: number
  zh: boolean
  password?: string
  onOpen: (path: string) => Promise<void>
  onClose: () => void
}) {
  const label = (cn: string, en: string) => (zh ? cn : en)
  const [busy, setBusy] = useState(false)
  const [modelName, setModelName] = useState('')
  const [log, setLog] = useState('')
  const [translationSummary, setTranslationSummary] = useState('')
  const [error, setError] = useState('')
  const [fontAdvice, setFontAdvice] = useState<{
    font: string
    localFamilyAvailable: boolean
    localCoversText: boolean
    downloads: { label: string; url: string }[]
  } | null>(null)
  const [outputs, setOutputs] = useState<string[]>([])
  const [options, setOptions] = useState<PdfTranslationOptions>({
    sourceLanguage: 'en',
    targetLanguage: 'zh',
    font: 'auto',
    threads: 1,
  })
  const [doc, setDoc] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [pageCount, setPageCount] = useState(1)
  const [tools, setTools] = useState<PdfEngineTool[]>([])
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [fonts, setFonts] = useState<Font[]>([])
  const [paragraph, setParagraph] = useState(0)
  const [text, setText] = useState('')
  const [format, setFormat] = useState<Record<string, unknown>>({})
  const [image, setImage] = useState('')
  const [layout, setLayout] = useState<Record<string, unknown> | null>(null)
  const [toolName, setToolName] = useState('text_fonts')
  const [query, setQuery] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [args, setArgs] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<PdfEngineContent[]>([])
  const [changed, setChanged] = useState(false)
  const [workFiles, setWorkFiles] = useState<{ name: string; path: string }[]>([])
  const activeJob = useRef<string | null>(null)
  const alive = useRef(true)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    void window.pdfApi
      .getAiSettings()
      .then((s) => setModelName(s.providers[s.provider].model))
      .catch(() => {})
    const off = window.pdfApi.onEngineProgress((p) => {
      if (p.requestId === activeJob.current) {
        setLog((log) => `${log}${p.message.trim()}\n`)
        if (p.message.startsWith('已验证 ')) setTranslationSummary(p.message.trim())
      }
    })
    return () => {
      alive.current = false
      off()
      if (activeJob.current) void window.pdfApi.engineCancel(activeJob.current)
      if (mode === 'craft') void window.pdfApi.craftClose()
    }
  }, [mode])
  const perform = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (alive.current) setBusy(false)
      activeJob.current = null
    }
  }
  const refresh = async (id: number, p = page) => {
    const info = dataOf(await window.pdfApi.craftCall('doc_info', { doc: id }))
    const count = Number(
      (info.document as { pages?: number } | undefined)?.pages ??
        info.page_count ??
        (Array.isArray(info.pages) ? info.pages.length : undefined) ??
        pageCount,
    )
    if (count > 0) setPageCount(count)
    p = Math.max(1, Math.min(p, count || 1))
    setPage(p)
    const content = dataOf(await window.pdfApi.craftCall('text_paragraphs', { doc: id, page: p }))
    const fontData = dataOf(await window.pdfApi.craftCall('text_fonts', { doc: id, page: p }))
    setParagraphs((content.paragraphs ?? []) as Paragraph[])
    setFonts((fontData.fonts ?? []) as Font[])
    const rendered = await window.pdfApi.craftCall('page_render', { doc: id, page: p, dpi: 96 })
    const img = rendered.content.find((c) => c.type === 'image')
    setImage(img?.data ? `data:${img.mimeType};base64,${img.data}` : '')
    setWorkFiles(await window.pdfApi.craftFiles())
  }
  const openCraft = () =>
    perform(async () => {
      const id = crypto.randomUUID()
      activeJob.current = id
      const opened = await window.pdfApi.craftOpen(path, id, password)
      const info = dataOf(opened.result)
      const documentId = Number(info.doc)
      setDoc(documentId)
      setTools(opened.tools)
      setPageCount(Number(info.pages ?? 1))
      setResult([])
      setArgs({ doc: documentId, page })
      await refresh(documentId)
    })
  const close = () => {
    if (
      changed &&
      !window.confirm(
        label('工作台有未导出的修改，确定放弃并返回？', 'Discard unexported workbench changes?'),
      )
    )
      return
    onClose()
  }
  const selectParagraph = (p: Paragraph) => {
    setParagraph(p.paragraph)
    setText(p.editor_text || p.text)
    setFormat({})
    setLayout(null)
  }
  const selectedTool = tools.find((tool) => tool.name === toolName)
  const props = selectedTool?.inputSchema.properties ?? {}
  const editArgs = { doc, page, paragraph, text, ...format }
  return (
    <dialog
      ref={dialog}
      className="pdf-engine-studio"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      aria-label={mode === 'translation' ? 'PDF 保版翻译' : 'PDF 字体与段落工作台'}
    >
      <header>
        <div>
          <h2>
            {mode === 'translation'
              ? label('整篇保版翻译', 'Layout-preserving translation')
              : label('字体与段落工作台', 'Fonts & paragraphs')}
          </h2>
          <p>{path.split(/[\\/]/).pop()}</p>
        </div>
        <button disabled={busy} onClick={close}>
          {label('返回文档', 'Back to document')}
        </button>
      </header>
      {error && (
        <p className="pdf-engine-error" role="alert">
          {error}
        </p>
      )}
      {mode === 'translation' ? (
        <>
          <p>
            {label(
              '保留公式、图表与页面布局，生成译文与双语 PDF。处理能力与字库已内置，使用系统所选 AI 模型。',
              'Preserve formulas, figures and layout; produce translated and bilingual PDFs with built-in processing and fonts, using your selected AI model.',
            )}
          </p>
          {modelName && (
            <p>
              {label('当前系统模型：', 'Selected model: ')}
              {modelName}
            </p>
          )}
          <div className="pdf-engine-fields">
            <label>
              {label('原文语言', 'Source language')}
              <input
                value={options.sourceLanguage}
                onChange={(e) => setOptions({ ...options, sourceLanguage: e.target.value })}
              />
            </label>
            <label>
              {label('目标语言', 'Target language')}
              <input
                list="pdf-engine-languages"
                value={options.targetLanguage}
                onChange={(e) => setOptions({ ...options, targetLanguage: e.target.value })}
              />
            </label>
            <datalist id="pdf-engine-languages">
              {['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar'].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </datalist>
            <label>
              {label('页码（留空为全部）', 'Pages (empty = all)')}
              <input
                value={options.pages ?? ''}
                placeholder="1-3,5"
                onChange={(e) => setOptions({ ...options, pages: e.target.value })}
              />
            </label>
            <label>
              {label('译文字体', 'Translation font')}
              <select
                value={options.font ?? ''}
                onChange={(e) => setOptions({ ...options, font: e.target.value || undefined })}
              >
                <option value="auto">
                  {label(
                    '按目标语言选内置字体（推荐，中文保持宋/黑体类别）',
                    'Built-in target-language font (recommended)',
                  )}
                </option>
                <option value="">
                  {label(
                    '严格保留源字体（无中文字形时仅生成 Memo）',
                    'Strict source font (Memo if target glyphs are absent)',
                  )}
                </option>
                {EDIT_FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {label(
                '逐段翻译并写入，保持原字号与行距；空间不足时保留原文，并在原处添加完整译文 Memo 批注，不压缩文字。',
                'Translate and write each paragraph at its original size and leading; keep the source and attach the full translation as a Memo when space is insufficient.',
              )}
            </p>
          </div>
          <p>
            {options.font === 'auto'
              ? label(
                  '当前允许使用目标语言的内置字体：中文使用 Noto 宋体或黑体，保留原字号、行距和版式；仅真正放不下的段落附 Memo。',
                  'Uses bundled target-language fonts at the original size and leading; Memo is reserved for overflow.',
                )
              : !options.font
                ? label(
                    '严格保留源字体：西文字体通常没有中文字形，中文译文可能只能附在 Memo。建议选择上方推荐选项。',
                    'Strict source fonts may lack target-language glyphs. Select the recommended option to translate page text.',
                  )
                : null}
          </p>
          <details>
            <summary>{label('公式与字体选项', 'Formula and font options')}</summary>
            <div className="pdf-engine-fields">
              <label>
                {label('公式字体匹配（正则）', 'Formula font regex')}
                <input
                  value={options.formulaFont ?? ''}
                  onChange={(e) => setOptions({ ...options, formulaFont: e.target.value })}
                />
              </label>
              <label>
                {label('公式字符匹配（正则）', 'Formula character regex')}
                <input
                  value={options.formulaCharacters ?? ''}
                  onChange={(e) => setOptions({ ...options, formulaCharacters: e.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!options.ignoreCache}
                  onChange={(e) => setOptions({ ...options, ignoreCache: e.target.checked })}
                />
                {label('重新翻译，忽略缓存', 'Ignore translation cache')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!options.skipSubsetFonts}
                  onChange={(e) => setOptions({ ...options, skipSubsetFonts: e.target.checked })}
                />
                {label('保留完整字体（文件较大）', 'Keep full fonts (larger file)')}
              </label>
            </div>
          </details>
          <button
            disabled={busy || !options.sourceLanguage || !options.targetLanguage}
            onClick={() =>
              void perform(async () => {
                const id = crypto.randomUUID()
                activeJob.current = id
                setLog('')
                setTranslationSummary('')
                setOutputs(await window.pdfApi.translateDocument(path, options, id))
              })
            }
          >
            {label('开始整篇翻译', 'Translate document')}
          </button>
        </>
      ) : !doc ? (
        <>
          <p>
            {label(
              '吸收 PdfCraft 的保真编辑思路：使用实际 PDF 字体测量、检查段落溢出、保留撤销历史，并验证保存结果。所有能力均已内置。',
              'Built-in editing inspired by PdfCraft: measure with actual PDF fonts, check overflow, keep undo history and verify saved results.',
            )}
          </p>
          <button disabled={busy} onClick={() => void openCraft()}>
            {label('打开字体与段落工作台', 'Open fonts & paragraphs')}
          </button>
        </>
      ) : (
        <>
          <nav>
            <button
              disabled={busy || page <= 1}
              onClick={() =>
                void perform(async () => {
                  const next = page - 1
                  await refresh(doc, next)
                  setPage(next)
                  setParagraph(0)
                })
              }
            >
              ←
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              disabled={busy || page >= pageCount}
              onClick={() =>
                void perform(async () => {
                  const next = page + 1
                  await refresh(doc, next)
                  setPage(next)
                  setParagraph(0)
                })
              }
            >
              →
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await window.pdfApi.craftCall('edit_undo', { doc })
                  setChanged(true)
                  await refresh(doc)
                })
              }
            >
              {label('撤销', 'Undo')}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await window.pdfApi.craftCall('edit_redo', { doc })
                  setChanged(true)
                  await refresh(doc)
                })
              }
            >
              {label('重做', 'Redo')}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const saved = await window.pdfApi.craftSave()
                  if (saved) {
                    setOutputs((all) => [...all, saved])
                    setChanged(false)
                  }
                })
              }
            >
              {label('验证并导出 PDF', 'Verify & export PDF')}
            </button>
          </nav>
          <div className="pdf-engine-workspace">
            <div className="pdf-engine-preview">
              {image && <img src={image} alt={label('实际 PDF 渲染预览', 'Actual PDF render')} />}
            </div>
            <div className="pdf-engine-controls">
              <label>
                {label('选择段落', 'Paragraph')}
                <select
                  value={paragraph}
                  onChange={(e) => {
                    const p = paragraphs.find((p) => p.paragraph === Number(e.target.value))
                    if (p) selectParagraph(p)
                  }}
                >
                  <option value={0}>{label('请选择', 'Select a paragraph')}</option>
                  {paragraphs.map((p) => (
                    <option key={p.paragraph} value={p.paragraph}>
                      {p.paragraph}. {p.text.slice(0, 65)}
                    </option>
                  ))}
                </select>
              </label>
              {paragraph > 0 && (
                <>
                  <textarea
                    value={text}
                    rows={7}
                    onChange={(e) => {
                      setText(e.target.value)
                      setLayout(null)
                    }}
                  />
                  <div className="pdf-engine-fields">
                    <label>
                      {label('字体（默认保留源字体）', 'Font (source font by default)')}
                      <select
                        value={String(format.font_resource ?? '')}
                        onChange={(e) => {
                          const next = { ...format }
                          if (e.target.value) next.font_resource = e.target.value
                          else delete next.font_resource
                          setFormat(next)
                          setLayout(null)
                        }}
                      >
                        <option value="">{label('源字体', 'Source font')}</option>
                        {fonts
                          .filter((f) => !f.preview_only)
                          .map((f) => (
                            <option key={f.resource} value={f.resource}>
                              {f.font} ({f.resource})
                            </option>
                          ))}
                      </select>
                    </label>
                    {(
                      [
                        'size',
                        'width',
                        'line_spacing',
                        'char_spacing',
                        'scale',
                        'dx',
                        'dy',
                      ] as const
                    ).map((key, i) => (
                      <label key={key}>
                        {
                          (zh
                            ? [
                                '字号 pt',
                                '段落宽度 pt',
                                '行距倍数',
                                '字距 pt',
                                '水平缩放 %',
                                '水平位移 pt',
                                '垂直位移 pt',
                              ]
                            : [
                                'Size pt',
                                'Width pt',
                                'Line spacing',
                                'Character spacing pt',
                                'Horizontal scale %',
                                'Move X pt',
                                'Move Y pt',
                              ])[i]
                        }
                        <input
                          type="number"
                          step="0.1"
                          value={format[key] === undefined ? '' : String(format[key])}
                          placeholder={label('保留原值', 'Keep original')}
                          onChange={(e) => {
                            const next = { ...format }
                            if (e.target.value) next[key] = Number(e.target.value)
                            else delete next[key]
                            setFormat(next)
                            setLayout(null)
                          }}
                        />
                      </label>
                    ))}
                    <label>
                      {label('对齐', 'Alignment')}
                      <select
                        value={String(format.align ?? '')}
                        onChange={(e) => {
                          const next = { ...format }
                          if (e.target.value) next.align = e.target.value
                          else delete next.align
                          setFormat(next)
                        }}
                      >
                        <option value="">{label('原对齐', 'Original')}</option>
                        {['left', 'center', 'right', 'justify'].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {label('文字颜色', 'Text color')}
                      <input
                        type="color"
                        value={String(format.color ?? '#000000')}
                        onChange={(e) => setFormat({ ...format, color: e.target.value })}
                      />
                    </label>
                    {['bold', 'italic', 'underline'].map((v, i) => (
                      <label key={v}>
                        <input
                          type="checkbox"
                          checked={!!format[v]}
                          onChange={(e) => setFormat({ ...format, [v]: e.target.checked })}
                        />
                        {(zh ? ['粗体', '斜体', '下划线'] : ['Bold', 'Italic', 'Underline'])[i]}
                      </label>
                    ))}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const checked = dataOf(
                          await window.pdfApi.craftCall('text_edit_layout', {
                            doc,
                            page,
                            paragraph,
                            text,
                            ...Object.fromEntries(
                              Object.entries(format).filter(([key]) =>
                                ['size', 'width', 'font_resource'].includes(key),
                              ),
                            ),
                          }),
                        )
                        setLayout(checked)
                      })
                    }
                  >
                    {label('字体与溢出预检', 'Check fonts & overflow')}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const applied = await window.pdfApi.craftCall('text_edit', editArgs)
                        setResult(applied.content)
                        setChanged(true)
                        await refresh(doc)
                        setParagraph(0)
                        setLayout(null)
                      })
                    }
                  >
                    {label('应用段落修改', 'Apply paragraph edit')}
                  </button>
                  {layout && (
                    <p role="status">
                      {layout.overflow
                        ? label(
                            '段落会超出原区域，请缩小字号或调整宽度。',
                            'The paragraph overflows its source region; adjust size or width.',
                          )
                        : label(
                            '段落测量完成；应用后可查看实际渲染效果。',
                            'Paragraph measured; apply to see the actual render.',
                          )}
                    </p>
                  )}
                </>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const file = await window.pdfApi.craftPickPath('file')
                    if (!file) return
                    const imported = await window.pdfApi.craftCall('text_font_import', {
                      doc,
                      page,
                      path: file,
                    })
                    setResult(imported.content)
                    setChanged(true)
                    await refresh(doc)
                  })
                }
              >
                {label('导入完整 TTF / OTF 字体', 'Import full TTF / OTF font')}
              </button>
              {paragraph > 0 && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const source = paragraphs.find((p) => p.paragraph === paragraph)?.font ?? ''
                      setFontAdvice(
                        dataOf(
                          await window.pdfApi.craftCall('text_font_advice', {
                            doc,
                            page,
                            font: source,
                            text,
                          }),
                        ) as typeof fontAdvice,
                      )
                    })
                  }
                >
                  {label('同族字库检查与下载建议', 'Check local family & download advice')}
                </button>
              )}
              {fontAdvice && (
                <section>
                  <p>
                    {fontAdvice.font} ·{' '}
                    {fontAdvice.localCoversText
                      ? label('本机同族字体覆盖当前内容', 'A local family face covers this text')
                      : label(
                          '未找到能覆盖当前内容的本机同族字体；可安装原字体或明确选择其他字体。',
                          'No local family face covers this text. Install the source family or explicitly choose another face.',
                        )}
                  </p>
                  {fontAdvice.downloads.map((link) => (
                    <p key={link.url}>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    </p>
                  ))}
                </section>
              )}
              <button onClick={() => setAdvanced(!advanced)}>
                {label('全部 PDF 编辑工具', 'All PDF editing tools')} ({tools.length})
              </button>
            </div>
          </div>
          {advanced && (
            <section className="pdf-engine-all-tools">
              <h3>{label('全部工具', 'All tools')}</h3>
              <input
                placeholder={label('搜索工具名或说明', 'Search tools')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                value={toolName}
                onChange={(e) => {
                  setToolName(e.target.value)
                  setArgs({ doc, page })
                }}
              >
                {tools
                  .filter((t) =>
                    `${t.name} ${t.title} ${t.description}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.title ?? t.name} · {t.name}
                    </option>
                  ))}
              </select>
              <p>{selectedTool?.description}</p>
              <div className="pdf-engine-fields">
                {Object.entries(props).map(([key, schema]) => (
                  <label key={key} title={schema.description}>
                    {key}
                    {selectedTool?.inputSchema.required?.includes(key) ? ' *' : ''}
                    {schema.type === 'boolean' ? (
                      <select
                        value={args[key] === undefined ? '' : String(args[key])}
                        onChange={(e) => {
                          const next = { ...args }
                          if (e.target.value === '') delete next[key]
                          else next[key] = e.target.value === 'true'
                          setArgs(next)
                        }}
                      >
                        <option value="">{label('默认', 'Default')}</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : schema.enum ? (
                      <select
                        value={String(args[key] ?? '')}
                        onChange={(e) => setArgs({ ...args, [key]: e.target.value })}
                      >
                        <option value="">{label('默认', 'Default')}</option>
                        {schema.enum.map((v) => (
                          <option key={String(v)}>{String(v)}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={
                          args[key] === undefined
                            ? ''
                            : typeof args[key] === 'object'
                              ? JSON.stringify(args[key])
                              : String(args[key])
                        }
                        placeholder={
                          schema.type === 'array' || schema.type === 'object'
                            ? 'JSON'
                            : schema.description
                        }
                        onChange={(e) => {
                          const next = { ...args }
                          if (!e.target.value) delete next[key]
                          else if (schema.type === 'number' || schema.type === 'integer')
                            next[key] = Number(e.target.value)
                          else next[key] = e.target.value
                          setArgs(next)
                        }}
                      />
                    )}
                    {(key.includes('path') || key === 'directory' || key === 'out_dir') && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const value = await window.pdfApi.craftPickPath(
                              key.startsWith('out')
                                ? 'save'
                                : key.includes('dir')
                                  ? 'directory'
                                  : 'file',
                            )
                            if (value)
                              setArgs((a) => ({
                                ...a,
                                [key]: schema.type === 'array' ? [value] : value,
                              }))
                          })
                        }
                      >
                        {label('选择', 'Choose')}
                      </button>
                    )}
                  </label>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const converted = Object.fromEntries(
                      Object.entries(args).filter(([key]) => Object.hasOwn(props, key)),
                    )
                    for (const [key, schema] of Object.entries(props))
                      if (
                        (schema.type === 'object' || schema.type === 'array') &&
                        typeof converted[key] === 'string'
                      )
                        converted[key] = JSON.parse(converted[key] as string)
                    const called = await window.pdfApi.craftCall(toolName, converted)
                    setResult(called.content)
                    if (!selectedTool?.annotations?.readOnlyHint) setChanged(true)
                    let activeDoc = typeof converted.doc === 'number' ? converted.doc : doc
                    if (activeDoc !== doc) setDoc(activeDoc)
                    if (
                      ['doc_open', 'doc_create', 'doc_combine', 'doc_open_revision'].includes(
                        toolName,
                      )
                    ) {
                      const created = dataOf(called)
                      if (Number.isInteger(created.doc)) {
                        activeDoc = Number(created.doc)
                        setDoc(activeDoc)
                        setPage(1)
                      }
                    }
                    if (toolName === 'doc_close' && Number(converted.doc) === doc) {
                      setDoc(0)
                      return
                    }
                    await refresh(activeDoc, activeDoc === doc ? page : 1)
                  })
                }
              >
                {label('执行工具', 'Run tool')}
              </button>
            </section>
          )}
          {workFiles.length > 0 && (
            <details>
              <summary>
                {label('工作台文件（可导出任意结果）', 'Workbench files (export any result)')}
              </summary>
              {workFiles.map((f) => (
                <p key={f.path}>
                  {f.name}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const saved = await window.pdfApi.craftExport(f.path)
                        if (saved) setOutputs((o) => [...o, saved])
                      })
                    }
                  >
                    {label('导出文件', 'Export file')}
                  </button>
                </p>
              ))}
            </details>
          )}
          <details className="pdf-engine-result">
            <summary>{label('操作详情', 'Operation details')}</summary>
            {result.map((c, i) =>
              c.type === 'image' ? (
                <img
                  key={i}
                  src={`data:${c.mimeType};base64,${c.data}`}
                  alt="PDF operation result"
                />
              ) : (
                <pre key={i}>{c.text}</pre>
              ),
            )}
          </details>
        </>
      )}
      {busy && (
        <p role="status">
          {label('正在处理…', 'Working…')}{' '}
          <button
            onClick={() => {
              if (activeJob.current) void window.pdfApi.engineCancel(activeJob.current)
              else void window.pdfApi.craftClose()
            }}
          >
            {label('停止', 'Stop')}
          </button>
        </p>
      )}
      {busy && log && <p role="status">{log.trimEnd().split('\n').at(-1)}</p>}
      {log && (
        <details open={busy} className="pdf-translation-progress">
          <summary>{label('处理日志', 'Progress log')}</summary>
          <pre>{log}</pre>
        </details>
      )}
      {translationSummary && <p role="status">{translationSummary}</p>}
      {outputs.length > 0 && (
        <section>
          <h3>{label('已保存的结果', 'Saved results')}</h3>
          {outputs.map((file, i) => (
            <p key={`${file}-${i}`}>
              {file}
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (
                      changed &&
                      !window.confirm(label('放弃未导出的修改？', 'Discard unexported changes?'))
                    )
                      return
                    await onOpen(file)
                    onClose()
                  })
                }
              >
                {label('在 PDF 模块打开', 'Open in PDF module')}
              </button>
            </p>
          ))}
        </section>
      )}
    </dialog>
  )
}
