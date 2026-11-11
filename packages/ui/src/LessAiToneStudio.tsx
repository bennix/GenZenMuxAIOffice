import { useEffect, useRef, useState } from 'react'
import type { ToneEditor } from './less-ai-tone'
import {
  type AcademicToneOptions,
  applyToneChanges,
  captureToneSource,
  detectTone,
  humanizeRequest,
  parseHumanize,
  previewTone,
  rewriteTone,
  toneCoverage,
  TONE_RULES,
  type ToneChange,
  type ToneFinding,
  type ToneGenerate,
  type ToneSegment,
} from './less-ai-tone'
import {
  academicWorkflowRequest,
  parseAcademicAudit,
  parseAcademicResult,
  type AcademicAudit,
  type AcademicReport,
} from './academic-workflow'
import { ACADEMIC_HUMANIZER_SKILL } from './academic-humanizer-skill'
import './screenwriting.css'
import './less-ai-tone.css'
import { scanToneOffline, TONE_PROFILES, type ToneProfile } from './tone-profiles'

export function LessAiToneStudio({
  editor,
  generate,
  stream,
  onClose,
}: {
  editor: ToneEditor
  generate: ToneGenerate
  /** Streams the Chinese polish. When omitted, `generate` is used and the result is still applied at the end. */
  stream?: (
    prompt: { system: string; user: string },
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ) => Promise<string>
  onClose: () => void
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [range] = useState(() => editor.state.selection)
  const [scope, setScope] = useState<'selection' | 'document'>(
    range.empty ? 'document' : 'selection',
  )
  const [snapshot, setSnapshot] = useState(() => captureToneSource(editor, scope, range))
  const [style, setStyle] = useState('')
  const [mode, setMode] = useState<'general' | 'academic'>('general')
  const [academic, setAcademic] = useState<AcademicToneOptions>({
    kind: 'paper',
    venue: '',
    focus: 'clarity',
  })
  const [engine, setEngine] = useState<'offline' | 'ai'>('offline')
  const [profile, setProfile] = useState<ToneProfile>('conservative')
  const [academicAudit, setAcademicAudit] = useState<AcademicAudit | null>(null)
  const [academicReport, setAcademicReport] = useState<AcademicReport | null>(null)
  const [authorAnswers, setAuthorAnswers] = useState('')
  const [before, setBefore] = useState<ToneFinding[] | null>(null)
  const [after, setAfter] = useState<ToneFinding[] | null>(null)
  const [changes, setChanges] = useState<ToneChange[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const draftBox = useRef<HTMLPreElement>(null)
  const polishAbort = useRef<AbortController | null>(null)
  useEffect(() => {
    dialog.current?.showModal()
    return () => polishAbort.current?.abort()
  }, [])
  useEffect(() => {
    const box = draftBox.current
    if (box) box.scrollTop = box.scrollHeight
  }, [draft])
  const chosen = changes.filter((_, index) => selected.includes(index))
  const reset = () => {
    setAcademicAudit(null)
    setAcademicReport(null)
    setAuthorAnswers('')
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
      setStep(2)
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
    setDraft('')
    setBusy(true)
    const abort = new AbortController()
    polishAbort.current = abort
    try {
      if (editor.state.doc !== snapshot.doc) throw new Error('文档已变化，请重新打开工作台。')
      setStatus('正在生成中文润色建议…')
      const request = humanizeRequest(snapshot.segments, style)
      const raw = stream ? await stream(request, setDraft, abort.signal) : await generate(request)
      if (abort.signal.aborted) return
      const next = parseHumanize(raw, snapshot.segments)
      setStep(2)
      setChanges(next)
      setSelected(next.map((_, index) => index))
      setDraft('')
      setStatus('建议已生成，请在第 3 步逐条核对，再应用选中修改。原文尚未修改。')
    } catch (cause) {
      if (abort.signal.aborted) return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      if (polishAbort.current === abort) polishAbort.current = null
      setBusy(false)
    }
  }
  const runAcademic = async (rewrite: boolean) => {
    if (rewrite && !academicAudit) return
    setBusy(true)
    setError('')
    setChanges([])
    setSelected([])
    setAcademicReport(null)
    if (!rewrite) setAcademicAudit(null)
    setStatus(rewrite ? '正在根据审查结果改写并生成完整报告…' : '正在逐项审查六层规则与论断证据…')
    const abort = new AbortController()
    polishAbort.current = abort
    try {
      if (editor.state.doc !== snapshot.doc) throw new Error('文档已变化，请重新打开工作台。')
      const request = academicWorkflowRequest(
        snapshot.segments,
        style,
        academic,
        rewrite ? academicAudit! : undefined,
        authorAnswers,
      )
      const raw = stream ? await stream(request, () => {}, abort.signal) : await generate(request)
      if (abort.signal.aborted) return
      setStep(2)
      if (rewrite) {
        const result = parseAcademicResult(raw, snapshot.segments)
        setChanges(result.changes)
        setSelected(result.changes.map((_, index) => index))
        setAcademicReport(result.report)
        setStatus(
          result.changes.length
            ? '改写与报告已生成，请审阅后应用。原文尚未修改。'
            : '审查与报告已完成，原文无须修改。',
        )
      } else {
        setAcademicAudit(parseAcademicAudit(raw, snapshot.segments))
        setStatus('审查完成，尚未改写。请核对证据清单，可补充说明后继续。')
      }
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('')
    } finally {
      if (polishAbort.current === abort) polishAbort.current = null
      setBusy(false)
    }
  }
  const detect = (segments: ToneSegment[]) =>
    engine === 'offline'
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
      (change) =>
        snapshot.segments.find((segment) => segment.id === change.id)?.text === change.before,
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
            <p>
              {engine === 'offline' ? '离线规则扫描' : '当前 AI 复核'} ·{' '}
              {TONE_PROFILES[profile].label}
            </p>
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
          <p>
            {
              [
                '先告诉我，你想润色什么？',
                '确认一下，然后就可以开始。',
                '建议已准备好，由你决定如何修改。',
              ][step]
            }
          </p>
        </div>
        <button disabled={busy} onClick={onClose}>
          返回文档
        </button>
      </header>
      <nav className="tone-steps" aria-label="操作进度">
        {['选择文稿', '确认要求', '审阅结果'].map((label, index) => (
          <span key={label} aria-current={step === index ? 'step' : undefined}>
            {index + 1} · {label}
          </span>
        ))}
      </nav>
      {step < 2 && (
        <fieldset disabled={busy}>
          <legend>{step === 0 ? '你要处理什么内容？' : '已为你准备好推荐设置'}</legend>
          {step === 0 && (
            <>
              <div className="tone-template-grid" role="group" aria-label="选择用途模板">
                {[
                  ['general', '日常文章', '去掉空话套话，读起来更自然'],
                  ['paper', '学术论文', '保留术语和引用，表达更清楚'],
                  ['abstract', '论文摘要', '简洁呈现研究目的与结果'],
                  ['rebuttal', '审稿回复', '正式、清楚地回应评审意见'],
                  ['proposal', '研究申请', '突出研究价值与实施依据'],
                ].map(([id, title, description]) => (
                  <button
                    key={id}
                    type="button"
                    data-template={id}
                    aria-pressed={id === (mode === 'general' ? 'general' : academic.kind)}
                    onClick={() => {
                      setMode(id === 'general' ? 'general' : 'academic')
                      if (id !== 'general')
                        setAcademic({
                          kind: id as AcademicToneOptions['kind'],
                          venue: '',
                          focus: id === 'proposal' ? 'evidence' : 'clarity',
                        })
                      reset()
                      setDraft('')
                    }}
                  >
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 1 && mode === 'academic' && (
            <div className="tone-academic-guide">
              <p>
                学术模式保留专业术语、数据、公式与引用，检查冗长表达、过度宣称及证据对应。支持中文和英文。
              </p>
              <details>
                <summary>有特别要求？调整期刊、语体或规则</summary>
                <label>
                  文稿类型
                  <select
                    aria-label="文稿类型"
                    value={academic.kind}
                    onChange={(event) => {
                      setAcademic({
                        ...academic,
                        kind: event.target.value as AcademicToneOptions['kind'],
                      })
                      reset()
                    }}
                  >
                    <option value="paper">论文正文 / 学位论文</option>
                    <option value="abstract">摘要</option>
                    <option value="rebuttal">审稿回复</option>
                    <option value="proposal">基金 / 研究申请</option>
                  </select>
                </label>
                <label>
                  目标期刊或机构（可选）
                  <input
                    aria-label="目标期刊或机构"
                    maxLength={300}
                    value={academic.venue}
                    placeholder="例如 Nature、NeurIPS、NSF；留空保持原有语体"
                    onChange={(event) => {
                      setAcademic({ ...academic, venue: event.target.value })
                      reset()
                    }}
                  />
                </label>
                <label>
                  修改重点
                  <select
                    aria-label="修改重点"
                    value={academic.focus}
                    onChange={(event) => {
                      setAcademic({
                        ...academic,
                        focus: event.target.value as AcademicToneOptions['focus'],
                      })
                      reset()
                    }}
                  >
                    <option value="clarity">清楚简洁，减少模板化表达</option>
                    <option value="evidence">检查论断与证据，保留合理限定</option>
                    <option value="voice">贴近作者样本与期刊语体</option>
                  </select>
                </label>
                <small>
                  申请书保留研究愿景并关注可行性；正文未提供的证据需要作者核对，不会自动补造。
                </small>
                <details>
                  <summary>查看完整原版规则（v0.3.3 · 六层规则）</summary>
                  <pre>{ACADEMIC_HUMANIZER_SKILL}</pre>
                </details>
              </details>
            </div>
          )}
          {step === 1 && mode === 'general' && (
            <details>
              <summary>高级选项：检测方式与改写规则</summary>
              <label>
                检测方式
                <select
                  aria-label="检测方式"
                  value={engine}
                  onChange={(e) => {
                    setEngine(e.target.value as typeof engine)
                    reset()
                  }}
                >
                  <option value="offline">离线规则扫描（无需 AI，不发送正文）</option>
                  <option value="ai">当前 AI 复核（发送正文至已配置模型）</option>
                </select>
              </label>
              <label>
                改写规则
                <select
                  aria-label="改写规则"
                  value={profile}
                  onChange={(e) => {
                    setProfile(e.target.value as ToneProfile)
                    reset()
                  }}
                >
                  {Object.entries(TONE_PROFILES).map(([id, item]) => (
                    <option key={id} value={id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                离线扫描仅标出有限的词句线索，未命中不代表没有 AI 痕迹。改写始终使用当前 AI
                模型并发送处理正文；前后检测使用同一方式。专业术语等命中可能合理，请逐条核对。
              </small>
            </details>
          )}
          {step === 0 && (
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
          )}
        </fieldset>
      )}
      {step === 1 && (
        <fieldset disabled={busy}>
          <legend>补充要求</legend>
          <details>
            <summary>添加作者样本或风格参考（可选）</summary>
            <label>
              作者样本或风格参考（可选）
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
          </details>
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
            <button
              disabled={!snapshot.segments.length}
              onClick={() => void (mode === 'academic' ? runAcademic(false) : humanize())}
            >
              {mode === 'academic' ? '开始检查论文' : '开始润色'}
            </button>
            {mode === 'general' && (
              <details>
                <summary>只检查，不润色 / 局部修改</summary>
                <button disabled={!snapshot.segments.length} onClick={() => void run(false)}>
                  仅检测原文
                </button>
                <button disabled={!snapshot.segments.length} onClick={() => void run(true)}>
                  检测并局部修改
                </button>
              </details>
            )}
          </div>
        </fieldset>
      )}
      {step === 2 && mode === 'academic' && academicAudit && !academicReport && (
        <section className="tone-academic-guide" aria-label="学术审查报告">
          <h3>检查完成</h3>
          <p>
            发现 {academicAudit.issues.length} 项表达建议，
            {academicAudit.claims.filter((claim) => claim.status !== 'supported').length}{' '}
            项论断需要核对。可以直接继续，或展开查看。
          </p>
          <details>
            <summary>查看详细检查结果</summary>
            <p>位置以处理范围中的文本片段编号显示。模型仅核对本次提供的材料，未检索外部文献。</p>
            <h4>表达与结构问题（{academicAudit.issues.length}）</h4>
            {academicAudit.issues.length === 0 && <p>未发现需修改的表达模式。</p>}
            {academicAudit.issues.map((item, i) => (
              <div key={i}>
                <strong>
                  片段 {item.id + 1} · 第 {item.layer} 层 · {item.pattern}
                </strong>
                <blockquote>{item.quote}</blockquote>
                <p>建议：{item.fix}</p>
              </div>
            ))}
            <h4>论断与证据 / 可行性</h4>
            {academicAudit.claims.length === 0 && <p>未列出经验性论断或申请承诺。</p>}
            {academicAudit.claims.map((item, i) => (
              <div key={i}>
                <strong>
                  片段 {item.id + 1} ·{' '}
                  {
                    {
                      supported: '材料中有依据',
                      missing: '缺少依据',
                      overstated: '措辞强于证据',
                      uncertain: '待核实',
                    }[item.status]
                  }
                </strong>
                <blockquote>{item.quote}</blockquote>
                <p>依据：{item.evidence}</p>
                <p>建议：{item.action}</p>
              </div>
            ))}
            <h4>作者与期刊语体</h4>
            <ul>
              {academicAudit.voice.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <h4>需作者补充</h4>
            <ul>
              {academicAudit.authorQuestions.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>我想补充说明（可选）</summary>
            <label>
              补充依据或说明（可选）
              <textarea
                disabled={busy}
                maxLength={6000}
                value={authorAnswers}
                onChange={(event) => {
                  setAuthorAnswers(event.target.value)
                  setAcademicReport(null)
                  setChanges([])
                  setSelected([])
                }}
                placeholder="提供真实图表编号、数据依据、作者样本说明或确认保留的措辞"
              />
            </label>
          </details>
          <button disabled={busy} onClick={() => void runAcademic(true)}>
            继续：生成润色建议
          </button>
        </section>
      )}
      {step === 2 && mode === 'academic' && academicReport && (
        <section className="tone-academic-guide" aria-label="学术修改报告">
          <h3>润色建议已准备好</h3>
          <details>
            <summary>查看完整修改报告与待核对事项</summary>
            <p>以下报告对应完整建议稿；取消部分修改后，报告不代表实际应用版本。</p>
            <ul>
              {academicReport.changes.map((item, i) => (
                <li key={i}>
                  片段 {item.id + 1}：{item.reason}
                </li>
              ))}
            </ul>
            <h4>论断与证据调整</h4>
            <ul>
              {academicReport.evidenceNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <h4>语体说明</h4>
            <ul>
              {academicReport.voiceNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <h4>剩余作者事项</h4>
            <ul>
              {academicReport.authorQuestions.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <p>模型保留说明：{academicReport.preservation}</p>
            <p>程序已校验数字和常见公式、引用标记；研究结论与其他符号仍需逐条核对。</p>
          </details>
          <details>
            <summary>查看完整建议稿</summary>
            <pre>
              {previewTone(snapshot.segments, changes)
                .map((segment) => segment.text)
                .join('\n')}
            </pre>
          </details>
        </section>
      )}
      {step > 0 && draft && (
        <pre ref={draftBox} className="tone-stream" aria-live="polite">
          {draft}
        </pre>
      )}
      {step === 2 && mode === 'general' && before !== null && (
        <div className="screenwriting-columns">
          {report('处理前检测', before, snapshot.segments)}
          {report('处理后检测（选中建议稿）', after, revised)}
        </div>
      )}
      {step === 2 && beforeCoverage && afterCoverage && (
        <p role="status">
          规则命中占比：{beforeCoverage.percent.toFixed(1)}% → {afterCoverage.percent.toFixed(1)}
          %，{afterCoverage.percent <= beforeCoverage.percent ? '下降' : '上升'}{' '}
          {Math.abs(beforeCoverage.percent - afterCoverage.percent).toFixed(1)} 个百分点。
          {afterCoverage.percent > beforeCoverage.percent
            ? '建议稿占比增加，建议重新生成或暂不应用。'
            : '变化仅供参考，不保证检测结果下降。'}
        </p>
      )}
      {step === 2 && changes.length > 0 && (
        <fieldset disabled={busy}>
          <legend>{mode === 'academic' ? '5 · 逐条审阅并应用' : '3 · 逐条审阅修改'}</legend>
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
            {mode === 'general' && <button onClick={() => void recheck()}>重新检测选中修改</button>}
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
      <footer className="tone-wizard-nav">
        {step > 0 && (
          <button
            disabled={busy}
            onClick={() => {
              setStep(step === 2 ? 1 : 0)
              setStatus('')
              setError('')
            }}
          >
            上一步
          </button>
        )}
        {step === 0 && (
          <button
            disabled={!snapshot.segments.length}
            className="tone-primary"
            onClick={() => setStep(1)}
          >
            下一步
          </button>
        )}
      </footer>
      <details className="tone-about">
        <summary>规则来源与使用说明</summary>
        <small>
          学术润色使用 Academic Humanizer v0.3.3 · MIT © 2026 AIScientists-Dev。中文润色使用
          Humanizer-zh · MIT © 2026 歸藏。局部检测仍使用 lieflat-less-ai-tone · 内置版本 27d2923 ·
          MIT © 2026 shiujan。 本工作台不判断作者身份，也不保证能通过检测器。
        </small>
      </details>
    </dialog>
  )
}
