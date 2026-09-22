import { z } from 'zod'
import { ToolRegistry } from './registry'

const settingsSchema = z
  .object({
    autoCapture: z.boolean().optional(),
    useForReplies: z.boolean().optional(),
    sameProjectBoost: z.boolean().optional(),
    maxResults: z.number().int().min(1).max(10).optional(),
  })
  .strict()
const search = z
  .object({
    query: z.string().trim().min(1).max(10000),
    projectId: z
      .string()
      .regex(/^(default|proj-[a-f0-9]{12})$/)
      .optional(),
    sourceFile: z.string().min(1).max(32767).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict()

export interface KnowledgeServices {
  list(query: string, limit: number): unknown
  search(args: z.output<typeof search>): unknown
  delete(id: string): unknown
  clear(): unknown
  getSettings(): unknown
  setSettings(settings: z.output<typeof settingsSchema>): unknown
}

export function registerKnowledgeTools(registry: ToolRegistry, service: KnowledgeServices): void {
  registry.register({
    name: 'knowledge_list',
    module: 'knowledge',
    readOnly: true,
    description: '列出本地知识库记忆，可按文本过滤；与应用知识库使用同一存储。',
    input: z
      .object({
        query: z.string().max(10000).default(''),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .strict(),
    execute: async ({ query, limit }) => service.list(query, limit),
  })
  registry.register({
    name: 'knowledge_search',
    module: 'knowledge',
    readOnly: true,
    description:
      '按相关性检索知识库，可指定项目和来源文件上下文。关闭 useForReplies 时返回空结果。',
    input: search,
    execute: async (args) => service.search(args),
  })
  registry.register({
    name: 'knowledge_delete',
    module: 'knowledge',
    readOnly: false,
    description: '永久删除指定 ID 的本地知识记忆，不删除来源文档或对话。',
    input: z.object({ id: z.string().min(1).max(200) }).strict(),
    execute: async ({ id }) => service.delete(id),
  })
  registry.register({
    name: 'knowledge_clear',
    module: 'knowledge',
    readOnly: false,
    description: '永久清空所有项目的本地知识记忆，不删除来源文档或对话。',
    input: z.object({}).strict(),
    execute: async () => service.clear(),
  })
  registry.register({
    name: 'knowledge_get_settings',
    module: 'knowledge',
    readOnly: true,
    description: '读取自动积累、回复使用、同项目优先及检索数量设置。',
    input: z.object({}).strict(),
    execute: async () => service.getSettings(),
  })
  registry.register({
    name: 'knowledge_set_settings',
    module: 'knowledge',
    readOnly: false,
    description: '部分更新应用知识库设置并返回完整设置；未指定的字段保持不变。',
    input: settingsSchema,
    execute: async (args) => service.setSettings(args),
  })
}
