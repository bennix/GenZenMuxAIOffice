import { z } from 'zod'
import { ToolRegistry } from './registry'

export function registerMarkdownTools(
  registry: ToolRegistry,
  call: (
    id: string,
    request: { action: 'read' | 'replace' | 'save'; text?: string; expectedText?: string },
  ) => Promise<unknown>,
): void {
  const id = z.string().min(1).max(256)
  registry.register({
    name: 'markdown_read',
    module: 'markdown',
    readOnly: true,
    description:
      '读取正在编辑的 Markdown 正文（含未保存修改）、路径和脏状态；正文不含 frontmatter。',
    input: z.object({ id }).strict(),
    execute: ({ id }) => call(id, { action: 'read' }),
  })
  registry.register({
    name: 'markdown_replace',
    module: 'markdown',
    readOnly: false,
    description:
      '替换 Markdown 正文，保留 frontmatter，支持编辑器撤销。必须提交最近读取的 expectedText 防止覆盖并发编辑；不主动保存。',
    input: z
      .object({ id, text: z.string().max(200_000), expectedText: z.string().max(200_000) })
      .strict(),
    execute: ({ id, text, expectedText }) => call(id, { action: 'replace', text, expectedText }),
  })
  registry.register({
    name: 'markdown_save',
    module: 'markdown',
    readOnly: false,
    description: '通过编辑器原生保存流程保存已有路径的 Markdown 文档。未命名文档需先在界面保存。',
    input: z.object({ id }).strict(),
    execute: ({ id }) => call(id, { action: 'save' }),
  })
}
