import { z } from 'zod'
import { ToolRegistry } from './registry'

export interface ApplicationServices {
  status(): unknown
  listTabs(): unknown
  activateTab(id: string): unknown
  openFile(path: string): unknown
  createDocument(kind: 'word' | 'excel' | 'ppt' | 'markdown'): unknown
}

/** Shared schemas for the desktop host and its stdio client. */
export function registerApplicationTools(
  registry: ToolRegistry,
  services: ApplicationServices,
): void {
  registry.register({
    name: 'application_status',
    module: 'application',
    description: '获取运行中的 ZenOffice 版本。',
    input: z.object({}).strict(),
    readOnly: true,
    execute: async () => services.status(),
  })
  registry.register({
    name: 'application_list_tabs',
    module: 'application',
    description: '列出正在编辑的文件及标签 ID。',
    input: z.object({}).strict(),
    readOnly: true,
    execute: async () => services.listTabs(),
  })
  registry.register({
    name: 'application_activate_tab',
    module: 'application',
    description: '按标签 ID 切换到正在编辑的文件。',
    input: z.object({ id: z.string().min(1).max(256) }).strict(),
    readOnly: false,
    execute: async ({ id }) => services.activateTab(id),
  })
  registry.register({
    name: 'application_open_file',
    module: 'files',
    description: '在 ZenOffice 中打开已有的本地办公文件。',
    input: z.object({ path: z.string().min(1).max(32767) }).strict(),
    readOnly: false,
    execute: async ({ path }) => services.openFile(path),
  })
  registry.register({
    name: 'application_create_document',
    module: 'application',
    description:
      '新建 Word、Excel、PPT 或 Markdown 编辑标签。Excel 会在默认保存目录创建空白工作簿。',
    input: z.object({ kind: z.enum(['word', 'excel', 'ppt', 'markdown']) }).strict(),
    readOnly: false,
    execute: async ({ kind }) => services.createDocument(kind),
  })
}
