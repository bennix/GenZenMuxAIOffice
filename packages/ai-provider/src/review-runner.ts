import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  settingsForReviewModel,
  reviewerSystemPrompt,
  chairSystemPrompt,
  noveltyQuerySystemPrompt,
  supportsLiteratureReview,
  type ReviewLanguage,
} from './review-committee'
import type { AiChatRequest, AiChatResponse, AiSettings } from './types'

export interface ReviewResult {
  role: string
  model: string
  status: 'pending' | 'running' | 'done' | 'error'
  content?: string
  error?: string
}
export async function runDocumentReview(options: {
  settings: AiSettings
  profileId: string
  language: ReviewLanguage
  text: string
  images?: AiChatRequest['images']
  literature: boolean
  signal?: AbortSignal
  chat(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse>
  searchEvidence(rawQueries: string, fallback: string): Promise<string>
  onMember?(index: number, result: ReviewResult): void
  onChair?(result: ReviewResult): void
  onLiterature?(message: string): void
}) {
  const { settings, profileId, language, text, images, signal } = options
  const profile = REVIEW_PROFILES.find((p) => p.id === profileId)
  if (!profile) throw new Error('未知审稿标准')
  if (!text.trim()) throw new Error('没有可审阅的正文')
  const assignments = assignReviewModels(
    availableReviewModels(settings),
    profile.members.length + 1,
  )
  const zh = language === 'zh' || language === 'zh-TW'
  const chat = async (system: string, user: string, model: string, visual = false) => {
    signal?.throwIfAborted()
    const request: AiChatRequest = {
      settings: settingsForReviewModel(settings, model),
      system,
      user,
    }
    if (visual && images?.length) request.images = images
    const response = await options.chat(
      request,
      signal,
    )
    signal?.throwIfAborted()
    if (!response.ok || !response.content?.trim())
      throw new Error(response.error || 'AI 未返回有效内容')
    return response.content
  }
  let evidence = options.literature
    ? ''
    : 'External literature search was disabled; novelty was not independently verified.'
  if (options.literature && supportsLiteratureReview(profile)) {
    options.onLiterature?.(
      zh ? '正在准备并检索文献证据…' : 'Preparing and searching literature evidence…',
    )
    try {
      const raw = await chat(
        noveltyQuerySystemPrompt(language),
        text.slice(0, 30000),
        assignments[0]!,
      )
      evidence = await options.searchEvidence(raw, text.slice(0, 240))
      signal?.throwIfAborted()
      options.onLiterature?.(
        zh ? '文献证据已提供给创新性委员' : 'Literature evidence supplied to the novelty reviewer',
      )
    } catch (error) {
      signal?.throwIfAborted()
      evidence = `LIVE SCHOLARLY SEARCH FAILED: ${error instanceof Error ? error.message : String(error)}. External novelty was not verified.`
      options.onLiterature?.(
        zh
          ? '文献检索未完成，报告将披露限制'
          : 'Literature search incomplete; limitation will be disclosed',
      )
    }
  }
  const members = await Promise.all(
    profile.members.map(async (member, index) => {
      const base = { role: zh ? member.roleZh : member.roleEn, model: assignments[index]! }
      options.onMember?.(index, { ...base, status: 'running' })
      let result: ReviewResult
      try {
        const content = await chat(
          reviewerSystemPrompt(profile, member, language),
          `Review target: ${profile.labelEn}\n<DOCUMENT>\n${text}\n</DOCUMENT>${member.literatureReviewer ? `\n${evidence}` : ''}`,
          base.model,
          true,
        )
        result = { ...base, status: 'done', content }
      } catch (error) {
        signal?.throwIfAborted()
        result = {
          ...base,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }
      }
      options.onMember?.(index, result)
      return result
    }),
  )
  const successful = members.filter((member) => member.status === 'done')
  if (!successful.length)
    throw new Error(members.map((member) => `${member.role}: ${member.error}`).join('\n'))
  const base = { role: zh ? '委员会主席' : 'Committee Chair', model: assignments.at(-1)! }
  options.onChair?.({ ...base, status: 'running' })
  let chair: ReviewResult
  try {
    const content = await chat(
      chairSystemPrompt(profile, language),
      `ORIGINAL DOCUMENT:\n${text}\n\nIndependent reviews:\n${successful.map((member) => `## ${member.role}\n${member.content}`).join('\n\n')}\nFailed reviewers: ${
        members
          .filter((m) => m.status === 'error')
          .map((m) => m.role)
          .join(', ') || 'none'
      }`,
      base.model,
    )
    chair = { ...base, status: 'done', content }
  } catch (error) {
    signal?.throwIfAborted()
    chair = {
      ...base,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
  options.onChair?.(chair)
  return {
    members,
    chair,
    literatureEvidence: evidence,
    partial: members.some((m) => m.status === 'error') || chair.status === 'error',
  }
}
