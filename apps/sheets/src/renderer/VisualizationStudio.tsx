import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImageShareTarget } from '@genoffice/electron-utils/connect'
import { visualizationPng, visualizationSvgDataUrl } from './visualization-export'
import { VisualizationGuide } from './VisualizationGuide'
import {
  visualizationPrompt,
  parseChartSuggestion,
  type ChartSuggestion,
} from '@genoffice/visualization'
import { mountInteractiveChart } from '@genoffice/visualization'
import {
  chartCatalog,
  chartGroups,
  dataKindLabels,
  type DataKind,
  profileTable,
  recommendCharts,
  renderChartSvg,
  renderedChartIds,
  orderedChartFields,
  chartBindingNotes,
  type ChartGroup,
  type DataTable,
  type ChartRequest,
  renderDashboardSvg,
  serializeDashboardFile,
  parseDashboardFile,
  DASHBOARD_FILE_MAX_BYTES,
  dashboardFilterColumns,
  dashboardFilterValues,
  type DashboardFilter,
} from '@genoffice/visualization'

export function VisualizationStudio({
  table: initialTable,
  onClose,
}: {
  table: DataTable
  onClose: () => void
}) {
  const [table, setTable] = useState(initialTable)
  const [guided, setGuided] = useState(true)
  const [editingCard, setEditingCard] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const chartContainer = useRef<HTMLDivElement>(null)
  const profiles = useMemo(() => profileTable(table), [table])
  const recommendations = useMemo(() => recommendCharts(table), [table])
  const [chartId, setChartId] = useState('column')
  const [group, setGroup] = useState<ChartGroup | ''>('')
  const [dataKind, setDataKind] = useState<DataKind | ''>('')
  const [search, setSearch] = useState('')
  const [x, setX] = useState(table.columns[0]!)
  const [y, setY] = useState(
    profiles
      .filter((column) => column.kind === 'number')
      .slice(0, 1)
      .map((column) => column.name),
  )
  const [parent, setParent] = useState('')
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState('数据可视化')
  const [targets, setTargets] = useState<ImageShareTarget[]>([])
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [instruction, setInstruction] = useState('')
  const [suggestion, setSuggestion] = useState<ChartSuggestion | null>(null)
  const [interactiveError, setInteractiveError] = useState('')
  const [view, setView] = useState<'chart' | 'dashboard'>('chart')
  const [cards, setCards] = useState<ChartRequest[]>([])
  const [dashboardTitle, setDashboardTitle] = useState('数据仪表盘')
  const [dashboardColumns, setDashboardColumns] = useState<1 | 2 | 3>(2)
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter | undefined>()
  const filterColumns = useMemo(() => dashboardFilterColumns(cards), [cards])
  const filterValues = useMemo(() => {
    try {
      return dashboardFilter ? dashboardFilterValues(cards, dashboardFilter.column) : []
    } catch {
      return []
    }
  }, [cards, dashboardFilter?.column])
  useEffect(() => {
    setEditingCard(null)
  }, [cards])
  const fields = orderedChartFields[chartId]
  useEffect(() => {
    if (fields) setY((current) => fields.map((_, index) => current[index] ?? ''))
  }, [fields])
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const preview = useMemo(() => {
    if (guided) return { svg: '', error: '' }
    try {
      return { svg: renderChartSvg({ chartId, table, x, y, parent, target, title }), error: '' }
    } catch (error) {
      return { svg: '', error: error instanceof Error ? error.message : String(error) }
    }
  }, [chartId, table, x, y, parent, target, title, guided])
  const dashboard = useMemo(() => {
    try {
      return {
        svg: renderDashboardSvg({
          title: dashboardTitle,
          cards,
          columns: dashboardColumns,
          ...(dashboardFilter ? { filter: dashboardFilter } : {}),
        }),
        error: '',
      }
    } catch (error) {
      return { svg: '', error: error instanceof Error ? error.message : String(error) }
    }
  }, [cards, dashboardTitle, dashboardColumns, dashboardFilter])
  const output = view === 'dashboard' ? dashboard : preview
  const dashboardFile = useMemo(() => {
    if (!dashboard.svg) return { url: '', error: '' }
    try {
      return {
        url: `data:application/json;charset=utf-8,${encodeURIComponent(serializeDashboardFile({ title: dashboardTitle, cards, columns: dashboardColumns, ...(dashboardFilter ? { filter: dashboardFilter } : {}) }))}`,
        error: '',
      }
    } catch (error) {
      return { url: '', error: error instanceof Error ? error.message : String(error) }
    }
  }, [dashboard.svg, dashboardTitle, cards, dashboardColumns, dashboardFilter])
  const previewUrl = useMemo(
    () => (output.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(output.svg)}` : ''),
    [output.svg],
  )
  useEffect(() => {
    setInteractiveError('')
    if (guided || view !== 'chart' || !chartContainer.current || !preview.svg) return
    try {
      const mounted = mountInteractiveChart(chartContainer.current, {
        chartId,
        table,
        x,
        y,
        parent,
        target,
        title,
      })
      return mounted.dispose
    } catch (error) {
      setInteractiveError(error instanceof Error ? error.message : String(error))
    }
  }, [chartId, table, x, y, parent, target, title, preview.svg, view, guided])
  const available = chartCatalog.filter(
    (chart) =>
      (!group || chart.group === group) &&
      (!dataKind || chart.dataKinds.includes(dataKind)) &&
      `${chart.id} ${chart.label}`.toLowerCase().includes(search.toLowerCase()),
  )
  useEffect(() => {
    if (!sharing) return
    let active = true
    const refresh = async () => {
      try {
        const next = await window.desktopApi.listImageShareTargets()
        if (active) setTargets(next)
      } catch {
        /* Keep the last list; explicit refresh reports errors. */
      }
    }
    const timer = window.setInterval(() => void refresh(), 1500)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [sharing])
  async function loadTargets() {
    setSharing(true)
    setBusy(true)
    try {
      const next = await window.desktopApi.listImageShareTargets()
      setTargets(next)
      setStatus(next.length ? '请选择目标文件。' : '请先打开 Word、PPT、MD 或 PDF 文件。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  async function importDashboard(file: File) {
    setBusy(true)
    try {
      if (file.size > DASHBOARD_FILE_MAX_BYTES) throw new Error('仪表盘文件不能超过 8 MB。')
      const next = parseDashboardFile(await file.text())
      setCards(next.cards)
      setDashboardTitle(next.title)
      setDashboardColumns(next.columns ?? 2)
      setDashboardFilter(next.filter)
      setEditingCard(null)
      setView('dashboard')
      setStatus('仪表盘已导入，可继续编辑；源工作簿未修改。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  async function askAi() {
    setBusy(true)
    setSuggestion(null)
    setStatus('AI 正在分析字段与选图目的…')
    try {
      const settings = await window.desktopApi.getAiSettings()
      const response = await window.desktopApi.aiChat({
        settings,
        ...visualizationPrompt(table, instruction),
      })
      if (!response.ok) throw new Error(response.error || 'AI 请求失败。')
      setSuggestion(parseChartSuggestion(response.content ?? '', table))
      setStatus('建议已校验，请审阅后应用。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  async function share(targetId: string) {
    if (!targetId || !output.svg) return
    setBusy(true)
    try {
      const dataUrl =
        targets.find((item) => item.id === targetId)?.kind === 'pdf'
          ? visualizationSvgDataUrl(output.svg)
          : await visualizationPng(output.svg)
      const result = await window.desktopApi.shareImage(targetId, dataUrl)
      if (!result.ok) throw new Error(result.error || '图片插入失败。')
      setStatus('图表已插入目标文件，请在目标文件中保存。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="screenwriting-studio"
      aria-label="数据可视化工作台"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header>
        <div>
          <h2>数据可视化工作台</h2>
          <p>
            {table.rows.length} 行 · {table.columns.length} 列，首行为字段名
          </p>
        </div>
        {!guided && (
          <button disabled={busy} onClick={() => setGuided(true)}>
            重新引导选图
          </button>
        )}
        <button disabled={busy} onClick={onClose}>
          关闭
        </button>
      </header>
      {guided && (
        <VisualizationGuide
          table={initialTable}
          initialColumns={table.columns}
          onSkip={(next) => {
            setTable(next)
            setChartId('column')
            setX(next.columns[0]!)
            setY(
              profileTable(next)
                .filter((column) => column.kind === 'number')
                .slice(0, 1)
                .map((column) => column.name),
            )
            setParent('')
            setTarget('')
            setGuided(false)
          }}
          onApply={(request) => {
            setTable(request.table)
            setChartId(request.chartId)
            setX(request.x)
            setY(request.y)
            setParent(request.parent ?? '')
            setTarget(request.target ?? '')
            setTitle(request.title ?? '数据可视化')
            setGroup('')
            setDataKind('')
            setSearch('')
            setSuggestion(null)
            setView('chart')
            setEditingCard(null)
            setGuided(false)
          }}
        />
      )}
      <div className="screenwriting-columns" style={{ display: guided ? 'none' : undefined }}>
        <fieldset>
          <label>
            分析目的
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="例如：比较各地区收入，突出差异"
            />
          </label>
          <button disabled={busy} onClick={() => void askAi()}>
            AI 辅助选图
          </button>
          {suggestion && (
            <div>
              <p>{suggestion.reason}</p>
              <button
                disabled={busy}
                onClick={() => {
                  setChartId(suggestion.chartId)
                  setX(suggestion.x)
                  setY(suggestion.y)
                  setTitle(suggestion.title)
                  setParent(suggestion.parent ?? '')
                  setTarget(suggestion.target ?? '')
                  setGroup('')
                  setDataKind('')
                  setSearch('')
                  setSuggestion(null)
                }}
              >
                应用 AI 建议
              </button>
            </div>
          )}
          <label>
            搜索图形
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label>
            可视化目的
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value as ChartGroup | '')}
            >
              <option value="">全部分类</option>
              {Object.entries(chartGroups).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            图形
            <select
              aria-label="图形"
              value={chartId}
              onChange={(event) => setChartId(event.target.value)}
            >
              {!available.some((chart) => chart.id === chartId) && (
                <option value={chartId} disabled>
                  当前：{chartCatalog.find((chart) => chart.id === chartId)?.label}（不符合筛选）
                </option>
              )}
              {available.map((chart) => (
                <option
                  key={chart.id}
                  value={chart.id}
                  disabled={!(renderedChartIds as readonly string[]).includes(chart.id)}
                >
                  {chart.label}
                  {!(renderedChartIds as readonly string[]).includes(chart.id) ? '（开发中）' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            数据类型
            <select
              value={dataKind}
              onChange={(event) => setDataKind(event.target.value as DataKind | '')}
            >
              <option value="">全部数据类型</option>
              {Object.entries(dataKindLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!available.length && <p role="status">没有符合筛选条件的图形，请调整分类或关键词。</p>}
          <label>
            标题
            <input
              aria-label="图表标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            类别 / X / 节点列
            <select
              aria-label="类别 / X / 节点列"
              value={x}
              onChange={(event) => setX(event.target.value)}
            >
              {table.columns.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {fields ? (
            fields.map((field, index) => (
              <label key={field}>
                {field}列
                <select
                  aria-label={`${field}列`}
                  value={y[index] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setY((current) =>
                      fields.map((_, i) => (i === index ? value : (current[i] ?? ''))),
                    )
                  }}
                >
                  <option value="">请选择</option>
                  {table.columns.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            ))
          ) : (
            <label>
              {chartId === 'table' ? '展示字段（可多选）' : '数值列（可多选）'}
              <select
                multiple
                aria-label={chartId === 'table' ? '展示字段（可多选）' : '数值列（可多选）'}
                value={y}
                onChange={(event) =>
                  setY(Array.from(event.target.selectedOptions, (option) => option.value))
                }
              >
                {table.columns.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {['treemap', 'sunburst', 'tree', 'icicle', 'circle-packing'].includes(chartId) && (
            <label>
              父节点列
              <select
                aria-label="父节点列"
                value={parent}
                onChange={(event) => setParent(event.target.value)}
              >
                <option value="">请选择</option>
                {table.columns.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {['sankey', 'adjacency', 'arc', 'force-network', 'pivot'].includes(chartId) && (
            <label>
              {chartId === 'pivot' ? '列分类字段' : '目标节点列'}
              <select
                aria-label={chartId === 'pivot' ? '列分类字段' : '目标节点列'}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">请选择</option>
                {table.columns.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {chartId === 'bubble' && (
            <p>
              横轴选数值列；数值列依次选择纵轴、气泡面积。圆面积按数值比例缩放，面积为 0
              的记录不显示圆。
            </p>
          )}
          {chartId === 'quadrant' && <p>横轴和纵轴均为数值列；当前以横轴 0、纵轴 0 为象限分界。</p>}
          {chartId === 'population-pyramid' && (
            <p>类别列选择年龄段；两个非负数值列依次表示左、右侧人群。左右使用同一数值尺度。</p>
          )}
          {['violin', 'ridgeline'].includes(chartId) && (
            <p>
              每个数值列作为一组样本，忽略空值，至少两个有效样本。各组使用相同密度宽度尺度；细线表示四分位区间，白点表示中位数。
            </p>
          )}
          {['candlestick', 'ohlc'].includes(chartId) && (
            <p>
              类别列为日期或期次；四个数值列依次为开盘、收盘、最低、最高。红色表示收盘不低于开盘，绿色表示下跌；OHLC
              左短线为开盘，右短线为收盘。
            </p>
          )}
          {chartId === 'forest' && (
            <p>
              每行表示一项研究或指标，横线表示所提供的区间，方块表示估计值。区间由原始数据提供，不自动推断置信水平或研究权重。
            </p>
          )}
          {chartId === 'roc' && (
            <p>
              标签 1 为正类，0 为负类；分数越高越倾向正类。相同分数一起计算，类别列不参与 ROC 计算。
            </p>
          )}
          {chartId === 'kaplan-meier' && (
            <p>
              每行一名受试者，时间为非负数，事件状态为 1 或
              0。短竖线表示右删失；同一时刻先计算事件，再移除删失样本。当前绘制总体曲线，不包含分组或置信带。
            </p>
          )}
          {[
            'qq',
            'residual',
            'jitter',
            'control',
            'adjacency',
            'waffle',
            'gauge',
            'bullet',
            'calendar',
            'stream',
            'theme-river',
            'icicle',
            'proportional-area',
            'dot-matrix',
            'text-heatmap',
            'matrix',
            'stem-leaf',
            'pictogram',
            'beeswarm',
            'gantt',
            'timeline',
            'kpi',
            'progress',
            'pyramid',
            'marimekko',
            'small-multiples',
            'scatter-matrix',
            'sparkline',
            'radar',
            'table',
            'crosstab',
            'pivot',
            'arc',
            'force-network',
            'word-cloud',
            'dendrogram',
            'hexbin',
            'horizon',
            'circle-packing',
            'contour',
          ].includes(chartId) && <p>{chartBindingNotes[chartId]}</p>}
          <p>选图建议</p>
          {recommendations
            .filter((item) => (renderedChartIds as readonly string[]).includes(item.chartId))
            .map((item) => (
              <button
                key={item.chartId}
                onClick={() => {
                  setChartId(item.chartId)
                  setGroup('')
                  setDataKind('')
                  setSearch('')
                  if (item.columns.length > 1) {
                    setX(item.columns[0]!)
                    setY(item.columns.slice(1))
                  } else setY(item.columns)
                }}
              >
                {chartCatalog.find((chart) => chart.id === item.chartId)?.label}：{item.reason}
              </button>
            ))}
        </fieldset>
        <fieldset>
          <label>
            呈现方式
            <select
              aria-label="呈现方式"
              value={view}
              onChange={(event) => setView(event.target.value as 'chart' | 'dashboard')}
            >
              <option value="chart">单图</option>
              <option value="dashboard">仪表盘</option>
            </select>
          </label>
          <label>
            导入仪表盘
            <input
              aria-label="导入仪表盘"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importDashboard(file)
              }}
            />
          </label>
          {editingCard !== null && (
            <button
              disabled={busy || !preview.svg}
              onClick={() => {
                setCards((current) =>
                  current.map((card, index) =>
                    index === editingCard
                      ? structuredClone({ chartId, table, x, y, parent, target, title })
                      : card,
                  ),
                )
                setEditingCard(null)
                setView('dashboard')
                setStatus('图表已更新。')
              }}
            >
              更新仪表盘图表
            </button>
          )}
          {table !== initialTable && (
            <button
              disabled={busy}
              onClick={() => {
                setTable(initialTable)
                setX(initialTable.columns[0]!)
                setY(
                  profileTable(initialTable)
                    .filter((column) => column.kind === 'number')
                    .slice(0, 1)
                    .map((column) => column.name),
                )
                setEditingCard(null)
                setView('chart')
              }}
            >
              返回当前 Excel 选区
            </button>
          )}
          <button
            disabled={busy || !preview.svg || cards.length >= 6}
            onClick={() => {
              setCards((current) => [
                ...current,
                structuredClone({ chartId, table, x, y, parent, target, title }),
              ])
              setStatus('当前图表已加入仪表盘，后续字段修改不会改变已加入的图表。')
            }}
          >
            加入仪表盘（{cards.length}/6）
          </button>
          {view === 'dashboard' && (
            <>
              <label>
                仪表盘标题
                <input
                  aria-label="仪表盘标题"
                  value={dashboardTitle}
                  maxLength={100}
                  onChange={(event) => setDashboardTitle(event.target.value)}
                />
              </label>
              <label>
                布局列数
                <select
                  aria-label="布局列数"
                  value={dashboardColumns}
                  onChange={(event) => setDashboardColumns(Number(event.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>一列</option>
                  <option value={2}>两列</option>
                  <option value={3}>三列</option>
                </select>
              </label>
              <label>
                筛选字段
                <select
                  aria-label="仪表盘筛选字段"
                  value={dashboardFilter?.column ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    const column = event.target.value
                    if (!column) {
                      setDashboardFilter(undefined)
                      return
                    }
                    try {
                      setDashboardFilter({ column, values: dashboardFilterValues(cards, column) })
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : String(error))
                    }
                  }}
                >
                  <option value="">不筛选</option>
                  {filterColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
              {dashboardFilter && (
                <>
                  <label>
                    保留的分类值
                    <select
                      aria-label="仪表盘筛选值"
                      multiple
                      size={5}
                      disabled={busy}
                      value={dashboardFilter.values.map((value) => JSON.stringify(value))}
                      onChange={(event) =>
                        setDashboardFilter({
                          column: dashboardFilter.column,
                          values: Array.from(event.target.selectedOptions, (option) =>
                            JSON.parse(option.value),
                          ),
                        })
                      }
                    >
                      {filterValues.map((value) => (
                        <option key={JSON.stringify(value)} value={JSON.stringify(value)}>
                          {value === null
                            ? '空值 (null)'
                            : typeof value === 'string'
                              ? `文本 ${JSON.stringify(value)}`
                              : `${typeof value === 'number' ? '数值' : '布尔值'} ${value}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy} onClick={() => setDashboardFilter(undefined)}>
                    清除仪表盘筛选
                  </button>
                  <small>
                    筛选应用于全部卡片；保存文件保留完整数据及筛选条件，图片导出使用筛选后的数据。
                  </small>
                </>
              )}
              <ol aria-label="仪表盘图表">
                {cards.map((card, index) => (
                  <li key={index}>
                    {card.title || card.chartId}
                    <button
                      aria-label={`编辑图表 ${index + 1}`}
                      disabled={busy}
                      onClick={() => {
                        setTable(structuredClone(card.table))
                        setChartId(card.chartId)
                        setX(card.x)
                        setY([...card.y])
                        setTitle(card.title ?? '')
                        setParent(card.parent ?? '')
                        setTarget(card.target ?? '')
                        setEditingCard(index)
                        setView('chart')
                        setGroup('')
                        setDataKind('')
                        setSearch('')
                      }}
                    >
                      编辑
                    </button>
                    <button
                      aria-label={`上移图表 ${index + 1}`}
                      disabled={index === 0 || busy}
                      onClick={() =>
                        setCards((current) => {
                          const next = [...current]
                          ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                          return next
                        })
                      }
                    >
                      上移
                    </button>
                    <button
                      aria-label={`移除图表 ${index + 1}`}
                      disabled={busy}
                      onClick={() => setCards((current) => current.filter((_, i) => i !== index))}
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ol>
              {dashboardFile.url && (
                <a href={dashboardFile.url} download="dashboard.zenoffice.json">
                  保存可编辑仪表盘
                </a>
              )}
              {dashboardFile.error && <p role="alert">{dashboardFile.error}</p>}
              <small>文件包含图表配置及数据快照，可重新导入编辑；不自动同步源工作簿。</small>
            </>
          )}
          <h3>图形预览</h3>
          {output.error && <p role="alert">{output.error}</p>}
          {previewUrl && (
            <>
              {view === 'dashboard' ? (
                <img
                  src={previewUrl}
                  alt={dashboardTitle}
                  style={{ width: '100%', height: 'auto' }}
                />
              ) : (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <div
                    ref={chartContainer}
                    role="img"
                    aria-label={title}
                    style={{
                      width: '100%',
                      minWidth: ['word-cloud', 'horizon'].includes(chartId) ? 960 : undefined,
                      height: ['word-cloud', 'horizon'].includes(chartId) ? 600 : 400,
                    }}
                  />
                </div>
              )}
              <a
                href={previewUrl}
                download={view === 'dashboard' ? 'dashboard.svg' : 'visualization.svg'}
              >
                下载 SVG
              </a>
            </>
          )}
          {interactiveError && <p role="alert">{interactiveError}</p>}
          <button disabled={busy || !output.svg} onClick={() => void loadTargets()}>
            {busy ? '处理中…' : '分享至文件'}
          </button>
          {sharing && (
            <label>
              目标文件
              <select value="" disabled={busy} onChange={(event) => void share(event.target.value)}>
                <option value="">选择正在编辑的文件…</option>
                {targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {
                      {
                        docs: 'Word',
                        slides: 'PPT',
                        markdown: 'Markdown',
                        pdf: 'PDF',
                      }[item.kind]
                    }{' '}
                    · {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {status && <p role="status">{status}</p>}
          <small>
            空值保留为空值；统计图使用选区样本计算。目录中标注“开发中”的图形尚不可生成。
          </small>
        </fieldset>
      </div>
    </dialog>
  )
}
