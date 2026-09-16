import { z } from 'zod'
import { ToolRegistry } from './registry'

export interface WordToolRequest {
  action: 'read' | 'insert' | 'save'
  offset?: number
  maxChars?: number
  text?: string
  position?: 'start' | 'end'
  expectedRevision?: string
}

function hasUnsupportedDocxCharacter(text: string): boolean {
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code <= 0x8 || code === 0xb || code === 0xc || (code >= 0xe && code <= 0x1f)) return true
    if (code === 0xfffe || code === 0xffff) return true
  }
  return false
}

export function registerWordTools(
  registry: ToolRegistry,
  call: (id: string, request: WordToolRequest) => Promise<unknown>,
): void {
  const id = z.string().min(1).max(256)
  registry.register({
    name: 'word_read_text',
    module: 'word',
    readOnly: true,
    description:
      '分页读取正在编辑的 Word 正文纯文本（含未保存修改），返回冲突检查版本号。不包含页眉页脚或图片内容。',
    input: z
      .object({
        id,
        offset: z.number().int().min(0).max(100_000_000).default(0),
        maxChars: z.number().int().min(1).max(100_000).default(100_000),
      })
      .strict(),
    execute: ({ id, offset, maxChars }) => call(id, { action: 'read', offset, maxChars }),
  })
  registry.register({
    name: 'word_insert_text',
    module: 'word',
    readOnly: false,
    description:
      '在 Word 正文开头或结尾插入纯文本段落，保留原有内容与格式，可撤销。必须提供最近读取的 expectedRevision；不主动保存，应用自动保存设置仍生效。',
    input: z
      .object({
        id,
        text: z
          .string()
          .min(1)
          .max(50_000)
          .refine((text) => !hasUnsupportedDocxCharacter(text), '正文包含 DOCX 不支持的控制字符'),
        position: z.enum(['start', 'end']).default('end'),
        expectedRevision: z.string().uuid(),
      })
      .strict(),
    execute: ({ id, ...args }) => call(id, { action: 'insert', ...args }),
  })
  registry.register({
    name: 'word_save',
    module: 'word',
    readOnly: false,
    description:
      '通过原生 DOCX 保存流程保存已有路径的文档；外部文件有修改时拒绝覆盖。返回 dirty 状态，保存期间的新编辑可能仍未落盘。',
    input: z.object({ id }).strict(),
    execute: ({ id }) => call(id, { action: 'save' }),
  })
}
