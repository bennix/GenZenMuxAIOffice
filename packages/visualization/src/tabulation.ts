import type { EChartsOption } from 'echarts'
import { numericValue, type Cell, type DataTable } from './data'

export interface Tabulation {
  cells: string[][]
  description: string
}

const category = (value: Cell): string =>
  value === null || value === ''
    ? '（空值）'
    : typeof value === 'string'
      ? JSON.stringify(value)
      : String(value)

/** Counts all records; sum ignores missing measures without dropping their categories. */
export function tabulate(
  table: DataTable,
  kind: string,
  x: string,
  y: string[],
  target?: string,
): Tabulation {
  const xi = table.columns.indexOf(x)
  const indices = y.map((name) => table.columns.indexOf(name))
  if (xi < 0 || !indices.length || indices.some((i) => i < 0)) throw new Error('请选择有效字段。')
  if (kind === 'table') {
    const selected = [...new Set([xi, ...indices])]
    return {
      cells: [
        selected.map((i) => table.columns[i]!),
        ...table.rows.map((row) => selected.map((i) => String(row[i] ?? ''))),
      ],
      description: '原始记录；保留顺序、重复值与空值',
    }
  }
  if (y.length !== 1) throw new Error('交叉表和透视表需要一个 y 字段。')
  const ci = kind === 'crosstab' ? indices[0]! : table.columns.indexOf(target ?? '')
  if (ci < 0) throw new Error('请选择透视表的列分类字段。')
  if (xi === ci) throw new Error('行分类与列分类必须不同。')
  const rowNames: string[] = [],
    columnNames: string[] = []
  const rows = new Map<string, Map<string, number>>()
  for (const record of table.rows) {
    const row = category(record[xi]!),
      column = category(record[ci]!)
    if (!rows.has(row)) {
      rows.set(row, new Map())
      rowNames.push(row)
    }
    if (!columnNames.includes(column)) columnNames.push(column)
    if (rowNames.length > 40 || columnNames.length > 12)
      throw new Error('分类过多，请筛选至最多 40 个行分类、12 个列分类。')
    const measure = record[indices[0]!]!
    const value =
      kind === 'crosstab' ? 1 : measure === null || measure === '' ? 0 : numericValue(measure)
    if (value === null) throw new Error('透视表求和字段包含非数值内容。')
    const bucket = rows.get(row)!
    const sum = (bucket.get(column) ?? 0) + value
    if (!Number.isFinite(sum)) throw new Error('汇总数值超出有限范围。')
    bucket.set(column, sum)
  }
  const totals = columnNames.map(() => 0)
  const body = rowNames.map((row) => {
    const values = columnNames.map((column, index) => {
      const value = rows.get(row)!.get(column) ?? 0
      totals[index]! += value
      return value
    })
    const rowTotal = values.reduce((a, b) => a + b, 0)
    if (!Number.isFinite(rowTotal)) throw new Error('行合计超出有限范围。')
    return [row, ...values.map(String), String(rowTotal)]
  })
  const total = totals.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(total) || totals.some((value) => !Number.isFinite(value)))
    throw new Error('合计超出有限范围。')
  return {
    cells: [
      [`${x} / ${table.columns[ci]}`, ...columnNames, '合计'],
      ...body,
      ['合计', ...totals.map(String), String(total)],
    ],
    description:
      kind === 'crosstab'
        ? '计数（每条记录计 1）；空值作为独立类别'
        : `求和：${y[0]}；空数值不计入，空分类保留`,
  }
}

export function tabulationOption(result: Tabulation, title = ''): EChartsOption {
  const { cells } = result
  if (cells.length > 42 || cells[0]!.length > 14)
    throw new Error('表格过大，请缩小选区或筛选分类。')
  return {
    backgroundColor: '#ffffff',
    animation: false,
    title: { text: title, subtext: result.description, left: 'center' },
    series: [
      {
        type: 'custom',
        coordinateSystem: 'none',
        silent: true,
        data: cells.flatMap((row, r) => row.map((_, c) => [r, c])),
        renderItem: (_params, api) => {
          const r = Number(api.value(0)),
            c = Number(api.value(1))
          const width = (api.getWidth() - 40) / cells[0]!.length
          const height = (api.getHeight() - 90) / cells.length
          const fontSize = 14,
            lineHeight = 18
          const lines = ['']
          let used = 0
          for (const character of cells[r]![c]!) {
            const advance = /[\x00-\x7f]/.test(character) ? 8.5 : 14
            if (character === '\n' || used + advance > width - 16) {
              lines.push('')
              used = 0
              if (character === '\n') continue
            }
            lines[lines.length - 1] += character
            used += advance
          }
          if (width < 60 || lines.length * lineHeight > height - 8)
            throw new Error('当前尺寸无法清晰显示完整表格，请减少行列或增加导出尺寸。')
          const x = 20 + c * width,
            top = 70 + r * height
          return {
            type: 'group',
            children: [
              {
                type: 'rect',
                shape: { x, y: top, width, height },
                style: {
                  fill: r === 0 ? '#e2e8f0' : r % 2 ? '#ffffff' : '#f8fafc',
                  stroke: '#cbd5e1',
                  lineWidth: 1,
                },
              },
              {
                type: 'text',
                style: {
                  x: x + 8,
                  y: top + height / 2,
                  text: lines.join('\n'),
                  fontSize,
                  lineHeight,
                  verticalAlign: 'middle',
                  fill: '#0f172a',
                  fontWeight: r === 0 ? 'bold' : 'normal',
                },
              },
            ],
          }
        },
      },
    ],
  }
}
