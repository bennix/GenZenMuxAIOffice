import { expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from './server'
import { ToolRegistry } from './registry'
import { registerVisualizationTools } from './visualization-tools'

it('supports the MCP initialize, list and call lifecycle using the SDK client', async () => {
  const registry = new ToolRegistry()
  registerVisualizationTools(registry)
  const server = createMcpServer(registry)
  const client = new Client({ name: 'integration-test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toContain('visualization_render_svg')
    const catalog = await client.callTool({ name: 'visualization_catalog', arguments: {} })
    const catalogText = (catalog.content as { type: string; text: string }[])[0]!.text
    const charts = JSON.parse(catalogText) as { id: string; bindings: { orderedY?: string[] } }[]
    expect(charts.find((chart) => chart.id === 'forest')?.bindings.orderedY).toEqual([
      '估计值',
      '区间下限',
      '区间上限',
    ])
    const result = await client.callTool({
      name: 'visualization_render_svg',
      arguments: {
        chartId: 'bar',
        x: 'name',
        y: ['value'],
        title: 'MCP 图形',
        table: {
          columns: ['name', 'value'],
          rows: [
            ['甲', 3],
            ['乙', 7],
          ],
        },
      },
    })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result.content)).toContain('<svg')
    const hexbin = await client.callTool({
      name: 'visualization_render_svg',
      arguments: {
        chartId: 'hexbin',
        x: 'x',
        y: ['y'],
        table: {
          columns: ['x', 'y'],
          rows: [
            [0, 0],
            [0, 0],
            [5, 10],
          ],
        },
      },
    })
    expect(hexbin.isError).not.toBe(true)
    expect(JSON.stringify(hexbin.content)).toContain('共 3 条')
    const horizon = await client.callTool({
      name: 'visualization_render_svg',
      arguments: {
        chartId: 'horizon',
        x: 'time',
        y: ['value'],
        table: {
          columns: ['time', 'value'],
          rows: [
            [0, -3],
            [1, 3],
          ],
        },
      },
    })
    expect(horizon.isError).not.toBe(true)
    expect(JSON.stringify(horizon.content)).toContain('负值向上折叠')
    const packing = await client.callTool({
      name: 'visualization_render_svg',
      arguments: {
        chartId: 'circle-packing',
        x: 'node',
        parent: 'parent',
        y: ['weight'],
        table: {
          columns: ['node', 'parent', 'weight'],
          rows: [
            ['root', null, null],
            ['A', 'root', 4],
            ['B', 'root', 1],
          ],
        },
      },
    })
    expect(packing.isError).not.toBe(true)
    expect(JSON.stringify(packing.content)).toContain('父圆表示包含关系')
    const contour = await client.callTool({
      name: 'visualization_render_svg',
      arguments: {
        chartId: 'contour',
        x: 'x',
        y: ['y', 'height'],
        table: {
          columns: ['x', 'y', 'height'],
          rows: [
            [0, 0, 0],
            [1, 0, 2],
            [0, 1, 2],
            [1, 1, 4],
          ],
        },
      },
    })
    expect(contour.isError).not.toBe(true)
    expect(JSON.stringify(contour.content)).toContain('height等值线')
    const dashboard = await client.callTool({
      name: 'visualization_dashboard_svg',
      arguments: {
        title: '组合报表',
        filter: { column: 'name', values: ['甲'] },
        cards: ['bar', 'kpi'].map((chartId) => ({
          chartId,
          x: 'name',
          y: ['value'],
          table: {
            columns: ['name', 'value'],
            rows: [
              ['甲', 3],
              ['乙', 7],
            ],
          },
        })),
      },
    })
    expect(dashboard.isError).not.toBe(true)
    const composed = JSON.parse((dashboard.content as { text: string }[])[0]!.text)
    expect(composed.svg).toContain('组合报表')
    expect(composed.svg).toContain('显示筛选后的数据')
    expect(composed.svg).not.toContain('乙')
    expect(composed.svg.match(/<svg/g)).toHaveLength(3)
    const editable = {
      title: '可编辑组合',
      columns: 1,
      filter: { column: 'name', values: ['甲'] },
      cards: [
        {
          chartId: 'kpi',
          x: 'name',
          y: ['value'],
          table: { columns: ['name', 'value'], rows: [['甲', 3]] },
        },
      ],
    }
    const exported = await client.callTool({
      name: 'visualization_dashboard_export',
      arguments: editable,
    })
    expect(exported.isError).not.toBe(true)
    const file = JSON.parse((exported.content as { text: string }[])[0]!.text)
    expect(file.filename).toBe('dashboard.zenoffice.json')
    const imported = await client.callTool({
      name: 'visualization_dashboard_import',
      arguments: { content: file.content },
    })
    expect(imported.isError).not.toBe(true)
    expect(JSON.parse((imported.content as { text: string }[])[0]!.text)).toEqual(editable)
    const invalid = await client.callTool({
      name: 'visualization_render_svg',
      arguments: { chartId: 'bar' },
    })
    expect(invalid.isError).toBe(true)
  } finally {
    await client.close()
    await server.close()
  }
})
