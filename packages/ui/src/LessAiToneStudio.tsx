import { useEffect, useRef, useState } from 'react'
import type { ToneEditor } from './less-ai-tone'
import {
  applyToneChanges,
  captureToneSource,
  detectTone,
  humanizeTone,
  previewTone,
  rewriteTone,
  toneCoverage,
  TONE_RULES,
  type ToneChange,
  type ToneFinding,
  type ToneGenerate,
  type ToneSegment,
} from './less-ai-tone'
import './screenwriting.css'
import './less-ai-tone.css'
import { scanToneOffline, TONE_PROFILES, type ToneProfile } from './tone-profiles'

export function LessAiToneStudio({
  editor,
  generate,
  onClose,
}: {
  editor: ToneEditor
  generate: ToneGenerate
  onClose: () => void
}) {
  const [range] = useState(() => editor.state.selection)
  const [scope, setScope] = useState<'selection' | 'document'>(
    range.empty ? 'document' : 'selection',
  )
  const [snapshot, setSnapshot] = useState(() => captureToneSource(editor, scope, range))
  const [style, setStyle] = useState('')
  const [engine, setEngine] = useState<'offline' | 'ai'>('offline')
  const [profile, setProfile] = useState<ToneProfile>('conservative')
  const [before, setBefore] = useState<ToneFinding[] | null>(null)
  const [after, setAfter] = useState<ToneFinding[] | null>(null)
  const [changes, setChanges] = useState<ToneChange[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const chosen = changes.filter((_, index) => selected.includes(index))
  const reset = () => {
    setBefore(null)
    setAfter(null)
    setChanges([])
    setSelected([])
    setStatus('')
    setError('')
  }
  const run = async (rewrite: boolean) => {
    reset()
    setBusy(true)
    try {
      if (editor.state.doc !== snapshot.doc) throw new Error('文档已变化，请重新打开工作台。')
      setStatus('正在检测处理前的 AI 写作痕迹…')
      const initial = await detect(snapshot.segments)
      setBefore(initial)
      if (!rewrite) {
        setStatus('原文检测完成，尚未改写。')
        return
      }
      setStatus('正在按规则生成局部修改建议…')
      const next = await rewriteTone(generate, snapshot.segments, style, profile)
      setChanges(next)
      setSelected(next.map((_, i) => i))
      setStatus('正在检测建议稿的 AI 写作痕迹…')
      setAfter(await detect(previewTone(snapshot.segments, next)))
      setStatus(
        next.length ? '两次检测完成，请核对原意并选择要应用的修改。' : '未生成需要应用的修改。',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }
  const humanize = async () => {
    reset()
    setBusy(true)
    try {
      if (editor.state.doc !== snapshot.doc) throw new Error('文档已变化，请重新打开工作台。')
      setStatus('正在重写，去掉 AI 腔并换成更像人写的句子…')
      const next = await humanizeTone(generate, snapshot.segments, style)
      setChanges(next)
      setSelected(next.map((_, i) => i))
      setStatus('重写完成。核对原意后可以写回文档。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }
  const detect = (segments: ToneSegment[]) => engine === 'offline'
    ? Promise.resolve(scanToneOffline(segments, profile))
    : detectTone(generate, segments, style, profile)
  const recheck = async () => {
    setBusy(true)
    setError('')
    setStatus('正在检测实际选中的建议稿…')
    try {
      setAfter(await detect(previewTone(snapshot.segments, chosen)))
      setStatus('选中版本检测完成。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      setBusy(false)
    }
  }
  const revised = previewTone(snapshot.segments, chosen)
  const fullRewrite =
    chosen.length > 0 &&
    chosen.every(
      (change) => snapshot.segments.find((segment) => segment.id === change.id)?.text === change.before,
    )
  const beforeCoverage = before === null ? null : toneCoverage(snapshot.segments, before)
  const afterCoverage = after === null ? null : toneCoverage(revised, after)
  const report = (title: string, findings: ToneFinding[] | null, segments: ToneSegment[]) => {
    const coverage = toneCoverage(segments, findings ?? [])
    return (
      <section aria-label={title} className="tone-report">
        <h3>{title}</h3>
        {findings === null ? (
          <p>尚未检测</p>
        ) : (
          <>
            <p className="tone-percent">规则命中占比：{coverage.percent.toFixed(1)}%</p>
            <p>{engine === 'offline' ? '离线规则扫描' : '当前 AI 复核'} · {TONE_PROFILES[profile].label}</p>
            <p>
              命中字数 {coverage.matched} / 检测字数 {coverage.total}（不含空白，重叠只计一次）
            </p>
            <p>命中 {findings.length} 项表达特征</p>
            <ul>
              {findings.map((f, i) => (
                <li key={i}>
                  <span>{TONE_RULES[f.rule - 1]}</span>：{f.quote}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    )
  }
  return (
    <dialog
      ref={dialog}
      className="screenwriting-studio less-ai-tone-studio"
      aria-label="去 AI 味工作台"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header>
        <div>
          <strong>去 AI 味工作台</strong>
          <p>选中正文后重写，去掉套话，保留事实</p>
        </div>
        <button disabled={busy} onClick={onClose}>
          返回文档
        </button>
      </header>
      <p>
        AI 写作痕迹为参考评估，不是作者身份鉴定或 AI 生成概率。检测结果可能波动，请核对事实与原意。
      </p>
      <fieldset disabled={busy}>
        <label>
          检测方式
          <select aria-label="检测方式" value={engine} onChange={(e) => { setEngine(e.target.value as typeof engine); reset() }}>
            <option value="offline">离线规则扫描（无需 AI，不发送正文）</option>
            <option value="ai">当前 AI 复核（发送正文至已配置模型）</option>
          </select>
        </label>
        <label>
          改写规则
          <select aria-label="改写规则" value={profile} onChange={(e) => { setProfile(e.target.value as ToneProfile); reset() }}>
            {Object.entries(TONE_PROFILES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>
        <small>离线扫描仅标出有限的词句线索，未命中不代表没有 AI 痕迹。改写始终使用当前 AI 模型并发送处理正文；前后检测使用同一方式。专业术语等命中可能合理，请逐条核对。</small>
        <label>
          处理范围
          <select
            aria-label="处理范围"
            value={scope}
            onChange={(e) => {
              const next = e.target.value as typeof scope
              setScope(next)
              setSnapshot(captureToneSource(editor, next, range))
              reset()
            }}
          >
            <option value="selection" disabled={range.empty}>
              当前选区
            </option>
            <option value="document">全文</option>
          </select>
        </label>
        <label>
          风格参考（可选）
          <textarea
            rows={2}
            maxLength={3000}
            value={style}
            onChange={(e) => {
              setStyle(e.target.value)
              reset()
            }}
            placeholder="粘贴作者的风格要求；优先保留原有语体。"
          />
        </label>
        <details>
          <summary>
            查看处理原文（{snapshot.segments.reduce((n, s) => n + s.text.length, 0)} 字）
          </summary>
          <pre>{snapshot.segments.map((s) => s.text).join('\n')}</pre>
        </details>
        <small>
          保留标题、段落、列表、表格及文字格式；跳过代码、链接、引用块和嵌入对象。应用后可撤销。
        </small>
        <div className="screenwriting-actions">
          <button disabled={!snapshot.segments.length} onClick={() => void humanize()}>
            去 AI 味
          </button>
          <button disabled={!snapshot.segments.length} onClick={() => void run(false)}>
            仅检测原文
          </button>
          <button disabled={!snapshot.segments.length} onClick={() => void run(true)}>
            检测并局部修改
          </button>
        </div>
      </fieldset>
      <div className="screenwriting-columns">
        {report('处理前检测', before, snapshot.segments)}
        {report('处理后检测（选中建议稿）', after, revised)}
      </div>
      {beforeCoverage && afterCoverage && (
        <p role="status">
          规则命中占比：{beforeCoverage.percent.toFixed(1)}% → {afterCoverage.percent.toFixed(1)}
          %，{afterCoverage.percent <= beforeCoverage.percent ? '下降' : '上升'}{' '}
          {Math.abs(beforeCoverage.percent - afterCoverage.percent).toFixed(1)} 个百分点。
          {afterCoverage.percent > beforeCoverage.percent
            ? '建议稿占比增加，建议重新生成或暂不应用。'
            : '变化仅供参考，不保证检测结果下降。'}
        </p>
      )}
      {changes.length > 0 && (
        <fieldset disabled={busy}>
          <legend>逐条审阅修改</legend>
          {changes.map((change, index) => (
            <label className="tone-change" key={index}>
              <span>
                <input
                  type="checkbox"
                  checked={selected.includes(index)}
                  onChange={() => {
                    setSelected(
                      selected.includes(index)
                        ? selected.filter((i) => i !== index)
                        : [...selected, index],
                    )
                    setAfter(null)
                    setStatus('选中版本已变化，请重新检测建议稿。')
                  }}
                />
                {change.before === snapshot.segments.find((s) => s.id === change.id)?.text
                  ? '整段重写'
                  : TONE_RULES[change.rule - 1]}
              </span>
              <del>{change.before}</del>
              <ins>{change.after || '（删除）'}</ins>
            </label>
          ))}
          <div className="screenwriting-actions">
            <button onClick={() => void recheck()}>重新检测选中修改</button>
            <button
              disabled={!chosen.length || (after === null && !fullRewrite)}
              onClick={() => {
                try {
                  applyToneChanges(editor, snapshot, chosen)
                  onClose()
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause))
                }
              }}
            >
              应用选中修改
            </button>
          </div>
        </fieldset>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      <small>
        规则来源：lieflat-less-ai-tone · 内置版本 27d2923 · MIT © 2026
        shiujan。中文扩展参考 no-ai-slop-zh · 89d6fab · MIT © 2026 Peter Yang。
        英文模式为应用自有简洁表达规则。本工作台未接入独立的 AI 作者检测模型。
      </small>
    </dialog>
  )
}
