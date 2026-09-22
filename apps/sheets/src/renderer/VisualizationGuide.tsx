import { useEffect, useMemo, useRef, useState } from 'react'
import {
  chartCatalog,
  chartGroups,
  orderedChartFields,
  profileTable,
  renderChartSvg,
  visualizationPrompt,
  parseChartSuggestion,
  type ChartGroup,
  type ChartRequest,
  type DataTable,
} from '@genoffice/visualization'
import { guidedCharts, type GuidedChart } from './visualization-guide'
import './visualization-guide.css'

const typeNames = { number: '数值', date: '日期', category: '文本 / 分类', empty: '空列' }
const chartName = (id: string) => chartCatalog.find((c) => c.id === id)?.label ?? id
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function VisualizationRangePicker({
  initialRange,
  onLoad,
  onClose,
}: {
  initialRange?: string
  onLoad: (range: string) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [range, setRange] = useState(initialRange ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="screenwriting-studio"
      aria-label="选择可视化数据"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header>
        <h2>先选择要分析的数据</h2>
        <button disabled={busy} onClick={onClose}>
          关闭
        </button>
      </header>
      <p>
        当前选区不足两行。请输入当前工作表的数据范围，第一行应为列名，后面为数据。若已自动填入范围，可直接确认或按需修改。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void (async () => {
            setError('')
            setBusy(true)
            try {
              const ref = range.trim().toUpperCase()
              if (!/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(ref))
                throw new Error('请输入类似 A1:D20 的范围。')
              await onLoad(ref)
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause))
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        <label>
          数据范围
          <input
            aria-label="可视化数据范围"
            value={range}
            disabled={busy}
            onChange={(event) => setRange(event.target.value)}
            placeholder="例如 A1:D20"
          />
        </label>
        <p>接下来可以确认显示列、预览图表，或让 AI 辅助选择。</p>
        <button disabled={busy || !range.trim()}>
          {busy ? '正在读取数据…' : '读取数据并开始引导'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </dialog>
  )
}

export function VisualizationGuide({
  table,
  initialColumns,
  onApply,
  onSkip,
}: {
  table: DataTable
  initialColumns: string[]
  onApply: (request: ChartRequest) => void
  onSkip: (table: DataTable) => void
}) {
  const [step, setStep] = useState(0)
  const [columns, setColumns] = useState(initialColumns)
  const [goal, setGoal] = useState<ChartGroup | ''>('')
  const [instruction, setInstruction] = useState('')
  const [selected, setSelected] = useState<GuidedChart | null>(null)
  const [ai, setAi] = useState<GuidedChart | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const profiles = useMemo(() => profileTable(table), [table])
  const included = useMemo(() => {
    const indices = table.columns
      .map((_, i) => i)
      .filter((i) => columns.includes(table.columns[i]!))
    return {
      columns: indices.map((i) => table.columns[i]!),
      rows: table.rows.map((row) => indices.map((i) => row[i]!)),
    }
  }, [table, columns])
  const choices = useMemo(
    () => (included.columns.length ? guidedCharts(included, goal) : []),
    [included, goal],
  )
  const review = useMemo(() => {
    if (!selected) return { svg: '', error: '' }
    try {
      return { svg: renderChartSvg(selected.request), error: '' }
    } catch (cause) {
      return { svg: '', error: cause instanceof Error ? cause.message : String(cause) }
    }
  }, [selected])
  const update = (patch: Partial<ChartRequest>) =>
    setSelected((current) =>
      current ? { ...current, request: { ...current.request, ...patch } } : null,
    )
  async function askAi() {
    setBusy(true)
    setError('')
    setAi(null)
    try {
      const settings = await window.desktopApi.getAiSettings()
      const response = await window.desktopApi.aiChat({
        settings,
        ...visualizationPrompt(
          included,
          `${goal ? `分析目的：${chartGroups[goal]}。` : ''}${instruction || '根据现有数据推荐合适的图表和显示列，并说明原因。'}`,
        ),
      })
      if (!response.ok) throw new Error(response.error || 'AI 请求失败，请检查模型设置后重试。')
      const suggestion = parseChartSuggestion(response.content ?? '', included)
      const request = { ...suggestion, table: included }
      setAi({ request, reason: suggestion.reason, svg: renderChartSvg(request) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  function choose(candidate: GuidedChart) {
    setSelected(candidate)
    setStep(2)
    setError('')
  }
  return (
    <section className="visualization-guide" aria-label="可视化引导">
      <nav aria-label="创建图表步骤" className="viz-steps">
        {['确认数据', '选择图表', '确认显示列'].map((label, index) => (
          <span key={label} aria-current={step === index ? 'step' : undefined}>
            <b>{index + 1}</b>
            {label}
          </span>
        ))}
        <button disabled={busy || !columns.length} onClick={() => onSkip(included)}>
          自己选择图表
        </button>
      </nav>
      {step === 0 && (
        <>
          <h3>先看看，这些是你要展示的数据吗？</h3>
          <p>
            本次读取的数据，共 {table.rows.length}{' '}
            条记录。勾选允许用于图表的列；首行为字段名，原工作表不会被修改。
          </p>
          <div className="viz-column-grid">
            {profiles.map((p) => (
              <label key={p.name} className="viz-column-option">
                <input
                  type="checkbox"
                  checked={columns.includes(p.name)}
                  aria-label={`使用列 ${p.name}`}
                  onChange={(e) => {
                    setColumns((current) =>
                      e.target.checked
                        ? [...current, p.name]
                        : current.filter((name) => name !== p.name),
                    )
                    setAi(null)
                    setSelected(null)
                  }}
                />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {typeNames[p.kind]} · {p.distinct} 个不同值
                    {p.missing ? ` · ${p.missing} 个空值` : ''}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="viz-data-preview">
            <table>
              <caption>数据预览 · 前 {Math.min(5, table.rows.length)} 行</caption>
              <thead>
                <tr>
                  {included.columns.map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {included.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {row.map((value, j) => (
                      <td key={j}>{value === null ? '—' : String(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!columns.length && <p role="status">至少选择一列数据。</p>}
          <footer>
            <span>
              已选择 {columns.length} / {table.columns.length} 列
            </span>
            <button className="viz-primary" disabled={!columns.length} onClick={() => setStep(1)}>
              下一步：选择图表
            </button>
          </footer>
        </>
      )}
      {step === 1 && (
        <>
          <h3>你想从数据中看出什么？</h3>
          <div className="viz-goals">
            <button
              aria-pressed={!goal}
              onClick={() => {
                setGoal('')
                setAi(null)
              }}
              disabled={busy}
            >
              帮我选
            </button>
            {Object.entries(chartGroups).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={goal === id}
                disabled={busy}
                onClick={() => {
                  setGoal(id as ChartGroup)
                  setAi(null)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="viz-ai-brief">
            <label>
              补充分析目的（可选）
              <textarea
                aria-label="引导分析目的"
                value={instruction}
                onChange={(e) => {
                  setInstruction(e.target.value)
                  setAi(null)
                }}
                disabled={busy}
                placeholder="例如：比较各地区的收入和利润，不显示成本列"
              />
            </label>
            <button className="viz-primary" disabled={busy} onClick={() => void askAi()}>
              {busy ? 'AI 正在分析数据…' : 'AI 推荐图表与列'}
            </button>
          </div>
          <small>
            AI 使用已勾选列的字段概况和前 30 行样本；建议会用完整选区校验。建议不会直接修改工作表。
          </small>
          {error && <p role="alert">{error}</p>}
          {ai && (
            <article className="viz-ai-result">
              <div>
                <strong>AI 推荐：{chartName(ai.request.chartId)}</strong>
                <p>{ai.reason}</p>
                <p>
                  横轴 / 类别：{ai.request.x} · 显示列：{ai.request.y.join('、')}
                </p>
                {ai.request.parent && <p>父节点：{ai.request.parent}</p>}
                {ai.request.target && <p>目标 / 列分类：{ai.request.target}</p>}
                <button className="viz-primary" onClick={() => choose(ai)}>
                  采用建议，确认显示列
                </button>
              </div>
              <img src={svgUrl(ai.svg)} alt="AI 推荐图表预览" />
            </article>
          )}
          <h4>根据当前数据可直接生成</h4>
          <div className="viz-chart-choices">
            {choices.map((choice) => (
              <button
                key={choice.request.chartId}
                disabled={busy}
                onClick={() => choose(choice)}
                aria-label={`选择 ${chartName(choice.request.chartId)}`}
              >
                <img src={svgUrl(choice.svg)} alt="" />
                <strong>{chartName(choice.request.chartId)}</strong>
                <p>{choice.reason}</p>
                <small>
                  {choice.request.x} → {choice.request.y.join('、')}
                </small>
              </button>
            ))}
          </div>
          {!choices.length && (
            <p>
              这类图表需要特定字段结构。可让 AI
              检查当前数据，或点击“自己选择图表”查看完整目录与字段说明。
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => setStep(0)}>
              上一步：确认数据
            </button>
            <span>图表使用真实选区数据生成预览</span>
          </footer>
        </>
      )}
      {step === 2 && selected && (
        <>
          <h3>确认显示哪些列</h3>
          <p>图表类型：{chartName(selected.request.chartId)}。调整显示列后，预览同步更新。</p>
          <div className="viz-review">
            <fieldset>
              <label>
                图表标题
                <input
                  aria-label="引导图表标题"
                  value={selected.request.title ?? ''}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label>
                横轴 / 类别
                <select
                  aria-label="引导横轴"
                  value={selected.request.x}
                  onChange={(e) => update({ x: e.target.value })}
                >
                  {included.columns.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              {orderedChartFields[selected.request.chartId] ? (
                orderedChartFields[selected.request.chartId]!.map((role, index) => (
                  <label key={role}>
                    {role}
                    <select
                      aria-label={`引导 ${role}`}
                      value={selected.request.y[index] ?? ''}
                      onChange={(e) =>
                        update({
                          y: selected.request.y.map((name, i) =>
                            i === index ? e.target.value : name,
                          ),
                        })
                      }
                    >
                      <option value="">请选择</option>
                      {included.columns.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                ))
              ) : (
                <div className="viz-series">
                  <strong>显示列（可多选）</strong>
                  {included.columns.map((name) => (
                    <label key={name}>
                      <input
                        type="checkbox"
                        aria-label={`显示列 ${name}`}
                        checked={selected.request.y.includes(name)}
                        onChange={(e) =>
                          update({
                            y: e.target.checked
                              ? [...selected.request.y, name]
                              : selected.request.y.filter((value) => value !== name),
                          })
                        }
                      />
                      {name}
                    </label>
                  ))}
                </div>
              )}
              {(['parent', 'target'] as const)
                .filter((key) => selected.request[key] !== undefined)
                .map((key) => (
                  <label key={key}>
                    {key === 'parent' ? '父节点列' : '目标 / 列分类'}
                    <select
                      aria-label={`引导 ${key}`}
                      value={selected.request[key] ?? ''}
                      onChange={(e) => update({ [key]: e.target.value })}
                    >
                      {included.columns.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              <p className="viz-field-summary">
                当前显示：
                {[
                  ...new Set(
                    [
                      selected.request.x,
                      ...selected.request.y,
                      selected.request.parent,
                      selected.request.target,
                    ].filter(Boolean),
                  ),
                ].join('、')}
              </p>
            </fieldset>
            <div>
              {review.svg && (
                <img className="viz-large-preview" src={svgUrl(review.svg)} alt="确认图表预览" />
              )}
              {review.error && <p role="alert">{review.error}</p>}
            </div>
          </div>
          <footer>
            <button onClick={() => setStep(1)}>上一步：选择图表</button>
            <button
              className="viz-primary"
              disabled={!review.svg}
              onClick={() => onApply(selected.request)}
            >
              生成图表，进入工作台
            </button>
          </footer>
        </>
      )}
    </section>
  )
}
