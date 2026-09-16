import { z } from 'zod'
import { ToolRegistry } from './registry'

export interface ProjectServices {
  list(): unknown
  create(name: string): unknown
  rename(id: string, name: string): unknown
  files(id: string): unknown
  moveFile(path: string, id: string): unknown
  timeline(id: string, limit: number): unknown
  chats(id: string): unknown
  chat(id: string, chatId: string, limit: number): unknown
}

const id = z.string().regex(/^(default|proj-[a-f0-9]{12})$/)
const name = z.string().trim().min(1).max(200)

export function registerProjectTools(registry: ToolRegistry, service: ProjectServices): void {
  registry.register({
    name: 'projects_chats',
    module: 'projects',
    readOnly: true,
    description: '列出项目已持久化对话的 ID、更新时间与估算消息数量。',
    input: z.object({ id }).strict(),
    execute: async ({ id }) => service.chats(id),
  })
  registry.register({
    name: 'projects_chat_history',
    module: 'projects',
    readOnly: true,
    description: '读取项目中已有对话的最近消息，按时间顺序返回。chatId 来自 projects_chats。',
    input: z
      .object({
        id,
        chatId: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z0-9_-]+$/),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .strict(),
    execute: async ({ id, chatId, limit }) => service.chat(id, chatId, limit),
  })
  registry.register({
    name: 'projects_list',
    module: 'projects',
    description: '列出本地项目及文件数量、最近活动时间。',
    input: z.object({}).strict(),
    readOnly: true,
    execute: async () => service.list(),
  })
  registry.register({
    name: 'projects_create',
    module: 'projects',
    description: '创建本地项目并返回项目 ID。',
    input: z.object({ name }).strict(),
    readOnly: false,
    execute: async ({ name }) => service.create(name),
  })
  registry.register({
    name: 'projects_rename',
    module: 'projects',
    description: '重命名已有本地项目；默认项目不可重命名。',
    input: z.object({ id, name }).strict(),
    readOnly: false,
    execute: async ({ id, name }) => service.rename(id, name),
  })
  registry.register({
    name: 'projects_files',
    module: 'projects',
    description: '列出项目中仍存在的本地文件绝对路径。',
    input: z.object({ id }).strict(),
    readOnly: true,
    execute: async ({ id }) => service.files(id),
  })
  registry.register({
    name: 'projects_move_file',
    module: 'projects',
    description: '更改文件的项目归属并迁移其聊天记录；不移动磁盘上的文档。',
    input: z.object({ path: z.string().min(1).max(32767), id }).strict(),
    readOnly: false,
    execute: async ({ path, id }) => service.moveFile(path, id),
  })
  registry.register({
    name: 'projects_timeline',
    module: 'projects',
    description: '读取项目最近的对话活动摘要。',
    input: z.object({ id, limit: z.number().int().min(1).max(200).default(20) }).strict(),
    readOnly: true,
    execute: async ({ id, limit }) => service.timeline(id, limit),
  })
}
