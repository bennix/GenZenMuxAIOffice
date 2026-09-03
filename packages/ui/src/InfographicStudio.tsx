import { Infographic, registerFont, setDefaultFont } from '@antv/infographic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { infographicLocale, type UiFeatureLanguage } from './feature-i18n'

// Keep the local-first promise: AntV defaults to remote Alibaba/font CSS URLs.
// Use installed platform fonts instead; the hand-drawn theme falls back locally too.
setDefaultFont('PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif')
registerFont({
  fontFamily: '851tegakizatsu',
  name: 'System handwriting fallback',
  baseUrl: '',
  fontWeight: {},
})

export interface InfographicAsset {
  dataUrl: string
  syntax: string
  width: number
  height: number
}

export interface InfographicStudioProps {
  open: boolean
  language?: UiFeatureLanguage | undefined
  initialSyntax?: string | undefined
  onClose: () => void
  onInsert: (asset: InfographicAsset) => unknown | Promise<unknown>
  onAiGenerate?: ((prompt: string, currentSyntax: string) => Promise<string>) | undefined
}

export const INFOGRAPHIC_AI_SYSTEM = `You create AntV Infographic declarative syntax for ZenOffice.
Return syntax only, without Markdown fences or explanations. The first line must be "infographic TEMPLATE" and the second line "theme light", "theme dark", or "theme hand-drawn".
Use one of these reliable templates: list-row-simple-horizontal-arrow, sequence-timeline-simple, chart-column-simple, compare-swot, sequence-funnel-simple, list-grid-badge-card.
Use an indented data tree with title, desc, and lists. Each list item uses "- label ..." followed by "  desc ...". Keep all facts and numbers supplied by the user; never invent values. Prefer concise Chinese labels when the request or data is Chinese.`

export function cleanInfographicSyntax(value: string): string {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:infographic)?\s*\n([\s\S]*?)\n```$/i)
  return (fenced?.[1] ?? trimmed).replace(/^\s*(?:syntax|源码)\s*:\s*/i, '').trim()
}

/** Persist editable AntV source alongside a rendered image in OOXML descriptions. */
export const INFOGRAPHIC_METADATA_PREFIX = 'zenoffice-infographic:'

export function encodeInfographicMetadata(syntax: string): string {
  return `${INFOGRAPHIC_METADATA_PREFIX}${encodeURIComponent(cleanInfographicSyntax(syntax))}`
}

export function decodeInfographicMetadata(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(INFOGRAPHIC_METADATA_PREFIX)) return null
  try {
    const syntax = decodeURIComponent(value.slice(INFOGRAPHIC_METADATA_PREFIX.length))
    return syntax.trim() ? syntax : null
  } catch {
    return null
  }
}

export function InfographicPreview({ syntax, className }: { syntax: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ref.current || !syntax.trim()) return
    const infographic = new Infographic({ container: ref.current, width: '100%', editable: false })
    try {
      infographic.render(syntax)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    return () => infographic.destroy()
  }, [syntax])
  return error ? <div className={className}>{error}</div> : <div ref={ref} className={className} />
}

const PRESET_IDS = [
  'list-row-simple-horizontal-arrow',
  'sequence-timeline-simple',
  'chart-column-simple',
  'compare-swot',
  'sequence-funnel-simple',
  'list-grid-badge-card',
] as const

export const DEFAULT_INFOGRAPHIC_SYNTAX = `infographic list-row-simple-horizontal-arrow
theme light
data
  title 从数据到洞察
  desc 双击画布文字可直接编辑
  lists
    - label 01 采集
      desc 汇总可靠的数据来源
    - label 02 分析
      desc 找出趋势、差异与异常
    - label 03 行动
      desc 把结论转化为下一步`

export function defaultInfographicSyntax(language: UiFeatureLanguage | string = 'zh'): string {
  const text = infographicLocale(language)
  return `infographic list-row-simple-horizontal-arrow
theme light
data
  title ${text.defaultTitle}
  desc ${text.defaultDescription}
  lists
    - label 01 ${text.defaultSteps[0]}
      desc ${text.defaultStepDescriptions[0]}
    - label 02 ${text.defaultSteps[1]}
      desc ${text.defaultStepDescriptions[1]}
    - label 03 ${text.defaultSteps[2]}
      desc ${text.defaultStepDescriptions[2]}`
}

export function infographicSyntaxFromRows(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  title?: string,
  language: UiFeatureLanguage | string = 'zh',
): string {
  const text = infographicLocale(language)
  if (rows.length < 2) return defaultInfographicSyntax(language)
  const headers = rows[0]!.map(
    (value, index) => String(value ?? '').trim() || `${text.field} ${index + 1}`,
  )
  const body = rows.slice(1, 7)
  const items = body.map((row, index) => {
    const label = String(row[0] ?? '').trim() || `${text.item} ${index + 1}`
    const desc = headers
      .slice(1, 4)
      .map((header, column) => `${header}: ${String(row[column + 1] ?? '—')}`)
      .join(' · ')
    return `    - label ${label.replace(/\n/g, ' ')}\n      desc ${desc.replace(/\n/g, ' ')}`
  })
  return `infographic list-grid-badge-card
theme light
data
  title ${title ?? text.selectionTitle}
  desc ${text.selectionDescription}
  lists
${items.join('\n')}`
}

function replaceHeader(syntax: string, key: 'infographic' | 'theme', value: string): string {
  const expression = new RegExp(`^${key}\\s+.*$`, 'm')
  if (expression.test(syntax)) return syntax.replace(expression, `${key} ${value}`)
  const lines = syntax.split('\n')
  lines.splice(key === 'infographic' ? 0 : 1, 0, `${key} ${value}`)
  return lines.join('\n')
}

const CSS = `
.zo-info-shade{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;background:rgba(15,18,20,.48);backdrop-filter:blur(7px)}
.zo-info-studio{width:min(1120px,94vw);height:min(760px,90vh);display:grid;grid-template-rows:auto 1fr auto;background:#f7f5ef;color:#171918;border:1px solid #171918;box-shadow:0 28px 90px rgba(0,0,0,.34);font-family:"Avenir Next","Noto Sans SC",sans-serif}
.zo-info-head{display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid #171918;background:#f7f5ef}.zo-info-kicker{font:700 11px/1 monospace;letter-spacing:.16em;color:#b53a2d}.zo-info-head h2{font:650 19px/1.2 "Songti SC",serif;margin:0}.zo-info-head p{margin:0 0 0 auto;font-size:12px;color:#62655f}.zo-info-x{border:0;background:transparent;font-size:25px;cursor:pointer}
.zo-info-body{min-height:0;display:grid;grid-template-columns:360px 1fr}.zo-info-code{display:grid;grid-template-rows:auto 1fr;border-right:1px solid #171918;min-height:0}.zo-info-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border-bottom:1px solid #d3d0c7}.zo-info-tools label{display:grid;gap:4px;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.zo-info-tools select{height:31px;border:1px solid #989b94;background:#fff;padding:0 8px}.zo-info-code textarea{resize:none;border:0;outline:0;padding:16px;background:#202522;color:#e9eadf;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2}
.zo-info-preview{min-width:0;min-height:0;padding:22px;overflow:auto;background-color:#ebe8df;background-image:linear-gradient(rgba(23,25,24,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(23,25,24,.05) 1px,transparent 1px);background-size:20px 20px}.zo-info-canvas{min-height:480px;background:white;box-shadow:0 9px 32px rgba(25,28,26,.13)}.zo-info-error{padding:12px;color:#9e281e;background:#fff0eb;border:1px solid #cf756b;font-size:12px}
.zo-info-ai{display:flex;gap:8px;padding:10px 18px;border-top:1px solid #d3d0c7;background:#fff}.zo-info-ai input{min-width:0;flex:1;border:1px solid #989b94;padding:0 11px;font:13px/1.2 inherit}.zo-info-ai button{height:34px;border:0;background:#b53a2d;color:#fff;padding:0 15px;font-weight:650;cursor:pointer}.zo-info-foot{display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #171918}.zo-info-foot small{color:#666b65}.zo-info-foot button{height:34px;padding:0 16px;border:1px solid #171918;background:transparent;cursor:pointer}.zo-info-foot .primary{margin-left:auto;background:#171918;color:#fff}.zo-info-foot button:disabled,.zo-info-ai button:disabled{opacity:.45;cursor:not-allowed}@media(max-width:760px){.zo-info-body{grid-template-columns:1fr}.zo-info-code{display:none}.zo-info-head p{display:none}}
`

export function InfographicStudio({
  open,
  language = 'zh',
  initialSyntax,
  onClose,
  onInsert,
  onAiGenerate,
}: InfographicStudioProps) {
  const localizedDefault = useMemo(() => defaultInfographicSyntax(language), [language])
  const resolvedInitialSyntax = initialSyntax ?? localizedDefault
  const text = infographicLocale(language)
  const [syntax, setSyntax] = useState(resolvedInitialSyntax)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const infographicRef = useRef<Infographic | null>(null)
  const template = useMemo(
    () => /^infographic\s+([^\s]+)/m.exec(syntax)?.[1] ?? PRESET_IDS[0],
    [syntax],
  )
  const theme = useMemo(() => /^theme\s+([^\s]+)/m.exec(syntax)?.[1] ?? 'light', [syntax])

  useEffect(() => setSyntax(resolvedInitialSyntax), [resolvedInitialSyntax, open])
  useEffect(() => {
    if (!open || !canvasRef.current) return
    infographicRef.current?.destroy()
    const infographic = new Infographic({
      container: canvasRef.current,
      width: '100%',
      height: '100%',
      editable: true,
    })
    infographicRef.current = infographic
    try {
      infographic.render(syntax)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    return () => {
      infographic.destroy()
      if (infographicRef.current === infographic) infographicRef.current = null
    }
  }, [open, syntax])

  if (!open) return null
  const insert = async () => {
    const infographic = infographicRef.current
    const canvas = canvasRef.current
    if (!infographic || !canvas || error) return
    setBusy(true)
    try {
      const dataUrl = await infographic.toDataURL({ type: 'png', dpr: 2 })
      await onInsert({
        dataUrl,
        syntax,
        width: Math.max(640, canvas.clientWidth * 2),
        height: Math.max(400, canvas.clientHeight * 2),
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const generateWithAi = async () => {
    if (!onAiGenerate || !aiPrompt.trim() || aiBusy) return
    setAiBusy(true)
    setError('')
    try {
      setSyntax(cleanInfographicSyntax(await onAiGenerate(aiPrompt.trim(), syntax)))
      setAiPrompt('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setAiBusy(false)
    }
  }
  return (
    <div
      className="zo-info-shade"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <style>{CSS}</style>
      <section className="zo-info-studio" role="dialog" aria-modal="true" aria-label={text.title}>
        <header className="zo-info-head">
          <span className="zo-info-kicker">ZEN / INFOGRAPHIC</span>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
          <button className="zo-info-x" aria-label={text.close} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="zo-info-body">
          <aside className="zo-info-code">
            <div className="zo-info-tools">
              <label>
                {text.structure}
                <select
                  value={template}
                  onChange={(event) =>
                    setSyntax((value) => replaceHeader(value, 'infographic', event.target.value))
                  }
                >
                  {PRESET_IDS.map((value, index) => (
                    <option key={value} value={value}>
                      {text.presets[index]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text.style}
                <select
                  value={theme}
                  onChange={(event) =>
                    setSyntax((value) => replaceHeader(value, 'theme', event.target.value))
                  }
                >
                  <option value="light">{text.themes[0]}</option>
                  <option value="dark">{text.themes[1]}</option>
                  <option value="hand-drawn">{text.themes[2]}</option>
                </select>
              </label>
            </div>
            <textarea
              aria-label={text.syntax}
              value={syntax}
              spellCheck={false}
              onChange={(event) => setSyntax(event.target.value)}
            />
          </aside>
          <main className="zo-info-preview">
            {error ? <div className="zo-info-error">{error}</div> : null}
            <div ref={canvasRef} className="zo-info-canvas" />
          </main>
        </div>
        {onAiGenerate ? (
          <div className="zo-info-ai">
            <input
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void generateWithAi()
                }
              }}
              placeholder={text.aiPlaceholder}
            />
            <button disabled={!aiPrompt.trim() || aiBusy} onClick={() => void generateWithAi()}>
              {aiBusy ? text.aiBusy : text.aiAction}
            </button>
          </div>
        ) : null}
        <footer className="zo-info-foot">
          <small>{text.localRendering}</small>
          <button onClick={onClose}>{text.cancel}</button>
          <button className="primary" disabled={busy || !!error} onClick={() => void insert()}>
            {busy ? text.generating : text.insert}
          </button>
        </footer>
      </section>
    </div>
  )
}
