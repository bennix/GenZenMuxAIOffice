import { registerWritingTools } from '@genoffice/mcp-server/writing-tools'
import type { ToolRegistry } from '@genoffice/mcp-server'
import {
  runDocumentReview,
  type AiChatRequest,
  type AiChatResponse,
  type AiSettings,
} from '@genoffice/ai-provider'
import {
  loadScreenwritingSkill,
  screenwritingPrompt,
  type ScreenwritingTask,
} from '@genoffice/ai-provider/screenwriting'
import { parseNoveltyQueries, searchNoveltyEvidence } from '@genoffice/citations/novelty'
import type { TabManager } from './tab-manager'

interface Context {
  text: string
  revision?: string
  path: string | null
  dirty: boolean
  images?: { mime: string; base64: string }[]
  reviewMaterial?: {
    text: string
    images: { mime: string; base64: string }[]
    omittedImageCount: number
  }
}
export function registerDocumentAi(
  registry: ToolRegistry,
  tabs: TabManager,
  settings: () => AiSettings,
  chat: (request: AiChatRequest, signal?: AbortSignal) => Promise<AiChatResponse>,
) {
  const context = async (targetId: string) => {
    const tab = tabs.list().find((tab) => tab.id === targetId)
    if (!tab || !['docs', 'markdown'].includes(tab.kind))
      throw new Error('AI 审稿和编剧仅支持 Word、Markdown 文档')
    const content = (await (tab.kind === 'docs'
      ? tabs.requestWord(targetId, { action: 'ai_context' })
      : tabs.requestMarkdown(targetId, { action: 'ai_context' }))) as Context
    if (content.text.length > 120000) throw new Error('正文超过 120000 字符，请缩小文档后重试')
    const source = {
      targetId,
      kind: tab.kind,
      path: content.path,
      dirty: content.dirty,
      ...(tab.kind === 'docs' ? { revision: content.revision } : { expectedText: content.text }),
    }
    return { content, source }
  }
  registerWritingTools(registry, {
    screenwriting: async (request, signal) => {
      signal.throwIfAborted()
      const { content, source } = await context(request.targetId)
      const task = request.task as ScreenwritingTask
      screenwritingPrompt(task, request.medium, request.instruction, content.text, '')
      const skill = await loadScreenwritingSkill(task, signal)
      signal.throwIfAborted()
      const response = await chat(
        {
          settings: settings(),
          ...screenwritingPrompt(task, request.medium, request.instruction, content.text, skill),
        },
        signal,
      )
      signal.throwIfAborted()
      if (!response.ok || !response.content?.trim())
        throw new Error(response.error || 'AI 未返回有效内容')
      return { source, content: response.content, task, saved: false, inserted: false }
    },
    review: async (request, signal) => {
      signal.throwIfAborted()
      const { content, source } = await context(request.targetId)
      const material = content.reviewMaterial
      const text = material
        ? material.text +
          (material.omittedImageCount ? '\n[Some images omitted; disclose this limitation.]' : '')
        : content.text +
          '\n[At most five readable document images supplied; other images were not inspected.]'
      const result = await runDocumentReview({
        settings: settings(),
        profileId: request.profileId,
        language: request.language,
        text,
        images: material?.images ?? content.images,
        literature: request.literature,
        signal,
        chat,
        searchEvidence: async (raw, fallback) =>
          (await searchNoveltyEvidence(parseNoveltyQueries(raw, fallback), signal)).evidence,
      })
      return { source, ...result, saved: false, inserted: false }
    },
  })
}
