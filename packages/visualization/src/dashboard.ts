import { buildChartOption, renderChartSvg, type ChartRequest } from './render'
import { filterDashboardCards, type DashboardFilter } from './dashboard-filter'

export interface DashboardRequest {
  title: string
  cards: ChartRequest[]
  columns?: 1 | 2 | 3
  filter?: DashboardFilter
}

export function dashboardLayout(count: number, columns = 2, width = 1920) {
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error('仪表盘需要 1–6 张图表。')
  if (![1, 2, 3].includes(columns)) throw new Error('仪表盘列数必须为 1、2 或 3。')
  if (!Number.isInteger(width) || width < 960 || width > 4096)
    throw new Error('仪表盘宽度须为 960–4096。')
  const cols = Math.min(count, columns)
  const cardWidth = Math.floor((width - 48 - 24 * (cols - 1)) / cols)
  const cardHeight = Math.round(cardWidth * 0.625)
  const rows = Math.ceil(count / cols)
  const height = 96 + rows * (cardHeight + 24)
  if (height > 4096) throw new Error('仪表盘过高，请增加列数或减少图表。')
  return {
    width,
    height,
    cards: Array.from({ length: count }, (_, i) => ({
      x: 24 + (i % cols) * (cardWidth + 24),
      y: 96 + Math.floor(i / cols) * (cardHeight + 24),
      width: cardWidth,
      height: cardHeight,
    })),
  }
}

const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!,
  )

/** Re-render each saved chart at its actual tile size; never stretch a prior thumbnail. */
export function renderDashboardSvg(request: DashboardRequest, width = 1920): string {
  if (typeof request.title !== 'string' || request.title.length > 100)
    throw new Error('仪表盘标题最多 100 字符。')
  const layout = dashboardLayout(request.cards.length, request.columns, width)
  const titleLines = ['']
  let titleWidth = 0
  for (const ch of request.title) {
    const advance = /[\x00-\x7f]/.test(ch) ? 17 : 28
    if (ch === '\n' || titleWidth + advance > width - 48) {
      titleLines.push('')
      titleWidth = 0
      if (ch === '\n') continue
    }
    titleLines[titleLines.length - 1] += ch
    titleWidth += advance
  }
  if (titleLines.length > 2) throw new Error('仪表盘标题超过两行，请缩短标题或增大宽度。')
  const heading = titleLines
    .map(
      (line, i) =>
        `<text x="24" y="${titleLines.length === 1 ? 55 : 38 + 34 * i}" font-size="28" font-family="sans-serif" fill="#0f172a">${xml(line)}</text>`,
    )
    .join('')
  if (
    request.cards.reduce(
      (sum, card) => sum + card.table.rows.length * card.table.columns.length,
      0,
    ) > 400000
  )
    throw new Error('仪表盘数据合计不能超过 400000 个单元格。')
  request.cards.forEach((card, index) => {
    try {
      buildChartOption(card)
    } catch (error) {
      throw new Error(
        `第 ${index + 1} 张图表：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
  const charts = filterDashboardCards(request.cards, request.filter)
    .map((card, i) => {
      const tile = layout.cards[i]!
      try {
        if (!card.table.rows.length)
          return `<g transform="translate(${tile.x} ${tile.y})"><rect width="${tile.width}" height="${tile.height}" fill="white"/><text x="24" y="36" font-size="20">${xml(card.title ?? card.chartId)}</text><text x="24" y="80" font-size="16" fill="#64748b">筛选后无数据</text></g>`
        let svg = renderChartSvg(card, tile.width, tile.height)
        // Isolate clip paths and gradients across independently rendered panels.
        const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!)
        for (const id of ids) {
          svg = svg
            .replaceAll(`id="${id}"`, `id="panel${i}-${id}"`)
            .replaceAll(`url(#${id})`, `url(#panel${i}-${id})`)
        }
        return `<g transform="translate(${tile.x} ${tile.y})">${svg}</g>`
      } catch (error) {
        throw new Error(
          `第 ${i + 1} 张图表：${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
    .join('')
  const height = layout.height + (request.filter ? 32 : 0)
  if (height > 4096) throw new Error('筛选说明使画布过高，请增加列数或减少图表。')
  const footer = request.filter
    ? `<desc>${xml(JSON.stringify(request.filter))}</desc><text x="24" y="${height - 12}" font-size="14" font-family="sans-serif" fill="#475569">${xml(`筛选字段：${request.filter.column.slice(0, 40)} · 已选 ${request.filter.values.length} 项 · 显示筛选后的数据`)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}" viewBox="0 0 ${layout.width} ${height}"><rect width="100%" height="100%" fill="#f1f5f9"/>${heading}${charts}${footer}</svg>`
}
