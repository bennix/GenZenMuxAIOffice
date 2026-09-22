import { z } from 'zod'
import { ToolRegistry } from './registry'
import { tableSchema } from './visualization-tools'
import {
  validateTable,
  visualizationPrompt,
  parseChartSuggestion,
  renderChartSvg,
} from '@genoffice/visualization'

export interface AiServices {
  status(): unknown
  chat(system: string, user: string, signal: AbortSignal): Promise<unknown>
}

export function registerAiTools(registry: ToolRegistry, service: AiServices): void {
  registry.register({
    name: 'visualization_suggest',
    module: 'visualization',
    readOnly: false,
    description:
      '使用桌面 AI 推荐图表和显示列，返回理由及 SVG 预览，不修改文件。仅将 selectedColumns 的概况和前 30 行发送给模型，建议按完整所选数据校验。需桌面连接，可能产生模型费用。',
    input: z
      .object({
        table: tableSchema,
        selectedColumns: z.array(z.string()).min(1).max(256),
        instruction: z.string().max(10000).default('根据数据推荐图表和显示列，并说明理由。'),
      })
      .strict(),
    execute: async ({ table, selectedColumns, instruction }, context) => {
      validateTable(table)
      if (
        new Set(selectedColumns).size !== selectedColumns.length ||
        selectedColumns.some((name) => !table.columns.includes(name))
      )
        throw new Error('选择列必须存在且不能重复')
      const indices = selectedColumns.map((name) => table.columns.indexOf(name))
      const included = {
        columns: selectedColumns,
        rows: table.rows.map((row) => indices.map((i) => row[i]!)),
      }
      const prompt = visualizationPrompt(included, instruction)
      const response = await service.chat(prompt.system, prompt.user, context.signal)
      if (
        !response ||
        typeof response !== 'object' ||
        !('content' in response) ||
        typeof response.content !== 'string'
      )
        throw new Error('AI 没有返回文本建议')
      const suggestion = parseChartSuggestion(response.content, included)
      const { reason: _reason, ...binding } = suggestion
      const request = { ...binding, table: included }
      return {
        suggestion,
        request,
        mimeType: 'image/svg+xml',
        svg: renderChartSvg(request),
        saved: false,
      }
    },
  })
  registry.register({
    name: 'ai_status',
    module: 'ai',
    description: '查看桌面文本 AI 的提供商、模型与配置是否就绪；不返回 API 密钥。',
    input: z.object({}).strict(),
    readOnly: true,
    execute: async () => service.status(),
  })
  registry.register({
    name: 'ai_chat',
    module: 'ai',
    description:
      '使用桌面已保存的 AI 配置生成文本。会向已配置的模型服务发送输入并可能产生费用；不修改文档或保存聊天记录。长请求建议客户端超时设为 1200000 毫秒。',
    input: z
      .object({
        system: z.string().max(100000).default(''),
        user: z.string().min(1).max(100000),
      })
      .strict(),
    readOnly: false,
    execute: async ({ system, user }, context) => service.chat(system, user, context.signal),
  })
}
