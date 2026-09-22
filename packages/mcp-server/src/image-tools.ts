import { z } from 'zod'
import { ToolRegistry } from './registry'

export interface ImageServices {
  targets(): unknown
  insert(targetId: string, path: string): Promise<unknown>
}

export function registerImageTools(registry: ToolRegistry, service: ImageServices): void {
  registry.register({
    name: 'images_targets',
    module: 'images',
    readOnly: true,
    description: '列出可插入图片的正在编辑的 Word、PPT、Markdown 和 PDF 文件及目标 ID。',
    input: z.object({}).strict(),
    execute: async () => service.targets(),
  })
  registry.register({
    name: 'images_insert',
    module: 'images',
    readOnly: false,
    description:
      '将本机 PNG/JPEG 图片插入目标编辑器，SVG 文件仅支持 PDF 目标（转为图片插入当前页）。等待插入确认，不自动保存。未保存 Markdown 可接收内嵌图片。path 为绝对路径，targetId 来自 images_targets。',
    input: z
      .object({ targetId: z.string().min(1).max(200), path: z.string().min(1).max(32767) })
      .strict(),
    execute: async ({ targetId, path }) => service.insert(targetId, path),
  })
}
