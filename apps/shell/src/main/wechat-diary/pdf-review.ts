import {
  REVIEW_PROFILES,
  assignReviewModels,
  availableReviewModels,
  chairSystemPrompt,
  chatZenMux,
  reviewerSystemPrompt,
  settingsForReviewModel,
  type AiSettings,
  type ReviewProfile,
} from '@genoffice/ai-provider'
import { parseFileToText } from '@genoffice/file-parse'
import type { PendingWechatPdfReview } from './store'

const MAX_SOURCE_CHARS = 120_000
const EVIDENCE_CHUNK_CHARS = 28_000
const MAX_EVIDENCE_CHUNKS = 5

export interface PdfReviewRunnerDeps {
  readAiSettings: () => AiSettings
  persist: () => void
  parse?: (path: string) => Promise<{ ok: boolean; kind: string; text?: string; error?: string }>
  ask?: (settings: AiSettings, model: string, system: string, user: string) => Promise<string>
}

export function parsePdfReviewSelection(
  text: string,
): { profileId: string; language: 'zh' | 'en' } | null {
  const normalized = text.trim()
  const number = normalized.match(/(?:^|\s)(\d{1,2})(?:\s|$|[.、])/u)?.[1]
  let profile = number ? REVIEW_PROFILES[Number(number) - 1] : undefined
  if (!profile) {
    const lower = normalized.toLowerCase()
    profile = REVIEW_PROFILES.find(
      (candidate) =>
        lower.includes(candidate.id.toLowerCase()) ||
        normalized.includes(candidate.labelZh) ||
        lower.includes(candidate.labelEn.toLowerCase()),
    )
  }
  if (!profile) return null
  const language = /(?:英文|英语|english|\ben\b)/iu.test(normalized) ? 'en' : 'zh'
  return { profileId: profile.id, language }
}

function profileFor(task: PendingWechatPdfReview): ReviewProfile {
  return REVIEW_PROFILES.find((profile) => profile.id === task.profileId) ?? REVIEW_PROFILES[3]!
}

function chunks(text: string): string[] {
  const source = text.slice(0, MAX_SOURCE_CHARS)
  const result: string[] = []
  for (let offset = 0; offset < source.length; offset += EVIDENCE_CHUNK_CHARS) {
    result.push(source.slice(offset, offset + EVIDENCE_CHUNK_CHARS))
  }
  return result.slice(0, MAX_EVIDENCE_CHUNKS)
}

async function call(
  settings: AiSettings,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const config = settingsForReviewModel(settings, model).providers.zenmux
  const response = await chatZenMux(config, system, user)
  if (!response.ok || !response.content?.trim()) {
    throw new Error(response.error || 'ZenMux 未返回审稿内容')
  }
  return response.content.trim()
}

export async function preparePdfReviewTask(
  task: PendingWechatPdfReview,
  settings: AiSettings,
): Promise<void> {
  if (task.models.length >= 4) return
  const models = availableReviewModels(settings)
  if (!settings.providers.zenmux.apiKey.trim() || models.length === 0) {
    throw new Error('尚未配置可用的 ZenMux API Key 或文本模型')
  }
  task.models = assignReviewModels(models, 4)
}

/**
 * Resume-safe, genuinely multi-call review: evidence extraction calls, three independent
 * reviewer calls, then one chair call. Each completed call is persisted before continuing.
 */
export async function runPdfReviewTask(
  task: PendingWechatPdfReview,
  deps: PdfReviewRunnerDeps,
): Promise<string> {
  const settings = deps.readAiSettings()
  await preparePdfReviewTask(task, settings)
  deps.persist()
  const profile = profileFor(task)
  const parsed = await (deps.parse ?? parseFileToText)(task.pdfPath)
  if (!parsed.ok || parsed.kind !== 'text' || !parsed.text?.trim()) {
    throw new Error(parsed.error || 'PDF 没有可供审稿的可提取正文（扫描件请先执行 OCR）')
  }
  const sourceChunks = chunks(parsed.text)
  while (task.evidence.length < sourceChunks.length) {
    const index = task.evidence.length
    const report = await (deps.ask ?? call)(
      settings,
      task.models[index % 3]!,
      [
        '你是严格审稿委员会的证据秘书。只提取当前 PDF 文本分段中确实存在的内容。',
        '按“主要主张、方法与数据、实验/统计、公式与表格线索、引用与写作问题、可定位的硬伤”整理证据。',
        '必须标明这是局部分段，不得补写不存在的信息；用中文 Markdown 输出。',
      ].join('\n'),
      `文件：${task.fileName}\n用户要求：${task.request || '严格审稿'}\n分段 ${index + 1}/${sourceChunks.length}：\n\n${sourceChunks[index]}`,
    )
    task.evidence.push(report)
    deps.persist()
  }
  const scope = [
    `PDF 文件：${task.fileName}`,
    `用户附加要求：${task.request || '无'}`,
    `已提取字符数：${Math.min(parsed.text.length, MAX_SOURCE_CHARS)} / ${parsed.text.length}`,
    parsed.text.length > MAX_SOURCE_CHARS
      ? '限制：正文超过 120,000 字符，后续内容未进入本次自动审稿。'
      : '限制：本流程依据 PDF 可提取文本；无法仅凭文本完整核验图片视觉质量。',
    ...task.evidence.map((evidence, index) => `## 证据分段 ${index + 1}\n${evidence}`),
  ].join('\n\n')
  while (task.reviewerReports.length < profile.members.length) {
    const index = task.reviewerReports.length
    const member = profile.members[index]!
    const report = await (deps.ask ?? call)(
      settings,
      task.models[index]!,
      reviewerSystemPrompt(profile, member, task.language),
      scope,
    )
    task.reviewerReports.push(report)
    deps.persist()
  }
  if (!task.chairReport) {
    task.chairReport = await (deps.ask ?? call)(
      settings,
      task.models[3]!,
      chairSystemPrompt(profile, task.language),
      [
        `PDF：${task.fileName}`,
        `审稿档位：${profile.labelZh}`,
        ...task.reviewerReports.map(
          (report, index) =>
            `## 委员 ${index + 1}：${profile.members[index]?.roleZh ?? '审稿委员'}\n${report}`,
        ),
      ].join('\n\n'),
    )
    deps.persist()
  }
  if (task.language === 'en') {
    return [
      `# PDF AI Review Committee Report: ${task.fileName}`,
      `Review level: ${profile.labelEn}; workflow: ${task.evidence.length} evidence-extraction call(s) + 3 independent reviewers + 1 committee chair.`,
      '> This report is based on extractable PDF text. Formulas, figures, and scanned pages not represented by the text layer still require human verification. AI availability may be affected by network and model-service conditions.',
      `## Committee Chair (${task.models[3]})\n${task.chairReport}`,
      ...task.reviewerReports.map(
        (report, index) =>
          `## Reviewer ${index + 1}: ${profile.members[index]?.roleEn ?? 'Reviewer'} (${task.models[index]})\n${report}`,
      ),
    ].join('\n\n')
  }
  return [
    `# PDF AI 审稿委员会报告：${task.fileName}`,
    `审稿档位：${profile.labelZh}；流程：${task.evidence.length} 次证据提取 + 3 名独立委员 + 1 名主席。`,
    `> 本报告基于 PDF 可提取文本。公式、图表和扫描页若未被文字层完整表达，仍需人工复核。AI 功能可能受网络与模型服务状态影响。`,
    `## 委员会主席（${task.models[3]}）\n${task.chairReport}`,
    ...task.reviewerReports.map(
      (report, index) =>
        `## 委员 ${index + 1}：${profile.members[index]?.roleZh ?? '审稿委员'}（${task.models[index]}）\n${report}`,
    ),
  ].join('\n\n')
}
