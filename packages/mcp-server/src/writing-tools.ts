import { z } from 'zod'
import { REVIEW_PROFILES } from '@genoffice/ai-provider'
import { SCREENWRITING_TASKS } from '@genoffice/ai-provider/screenwriting'
import { ToolRegistry } from './registry'
import { LANGS } from '@genoffice/i18n'

export const writingSchema = z
  .object({
    targetId: z.string().min(1).max(256),
    task: z.enum(SCREENWRITING_TASKS.map(([id]) => id) as [string, ...string[]]),
    medium: z.enum(['电影', '短片', '电视剧 / 网剧', '舞台剧']).default('电影'),
    instruction: z.string().max(10000).default(''),
  })
  .strict()
export const reviewSchema = z
  .object({
    targetId: z.string().min(1).max(256),
    profileId: z.enum(REVIEW_PROFILES.map((p) => p.id) as [string, ...string[]]).default('science'),
    language: z.enum(LANGS as [(typeof LANGS)[number], ...(typeof LANGS)[number][]]).default('zh'),
    literature: z.boolean().default(true),
  })
  .strict()
export type WritingRequest = z.infer<typeof writingSchema>
export type ReviewRequest = z.infer<typeof reviewSchema>
export function registerWritingTools(
  registry: ToolRegistry,
  service: {
    screenwriting(request: WritingRequest, signal: AbortSignal): Promise<unknown>
    review(request: ReviewRequest, signal: AbortSignal): Promise<unknown>
  },
) {
  registry.register({
    name: 'ai_screenwriting',
    module: 'ai',
    readOnly: false,
    description:
      '读取 Word/Markdown 当前编辑正文，复用编剧技能和桌面模型生成可审阅文本。仅返回结果与源版本，不写入或保存文件；Excel 不支持。会向配置的模型发送文档内容。',
    input: writingSchema,
    execute: (request, context) => service.screenwriting(request, context.signal),
  })
  registry.register({
    name: 'ai_review',
    module: 'ai',
    readOnly: false,
    description:
      '读取 Word/Markdown 当前正文和可用图片，按应用审稿配置运行委员独立评审与主席汇总，可检索文献。返回报告、失败与源版本，不改写或保存正文；调用模型和文献服务可能产生费用。',
    input: reviewSchema,
    execute: (request, context) => service.review(request, context.signal),
  })
}
