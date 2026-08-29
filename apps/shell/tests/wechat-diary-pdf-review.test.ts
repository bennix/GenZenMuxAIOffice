import { describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import { parsePdfReviewSelection, runPdfReviewTask } from '../src/main/wechat-diary/pdf-review'
import type { PendingWechatPdfReview } from '../src/main/wechat-diary/store'

function task(): PendingWechatPdfReview {
  return {
    messageId: 'pdf-message',
    userId: 'reader@im.wechat',
    contextToken: 'context',
    diaryPath: '/diary/window.md',
    pdfPath: '/diary/paper.pdf',
    fileName: 'paper.pdf',
    request: '重点检查方法和统计',
    profileId: 'elsevier',
    language: 'zh',
    models: ['model-a', 'model-b', 'model-c', 'model-chair'],
    evidence: [],
    reviewerReports: [],
    chairReport: '',
    ackSent: true,
    finalSent: false,
  }
}

describe('wechat PDF multi-round review', () => {
  it('uses the same profile choices as the review UI and accepts a report language', () => {
    expect(parsePdfReviewSelection('4 中文')).toEqual({ profileId: 'elsevier', language: 'zh' })
    expect(parsePdfReviewSelection('IEEE 顶级会议 英文')).toEqual({
      profileId: 'ieee-top-conference',
      language: 'en',
    })
    expect(parsePdfReviewSelection('随便看看')).toBeNull()
  })

  it('runs evidence extraction, three independent reviewers and a chair in order', async () => {
    const current = task()
    const asks: Array<{ model: string; system: string }> = []
    const persist = vi.fn()
    const report = await runPdfReviewTask(current, {
      readAiSettings: () => defaultAiSettings(),
      persist,
      parse: async () => ({ ok: true, kind: 'text', text: '论文正文与实验数据'.repeat(100) }),
      ask: async (_settings, model, system) => {
        asks.push({ model, system })
        return `result-${asks.length}`
      },
    })

    expect(asks).toHaveLength(5)
    expect(asks.map((item) => item.model)).toEqual([
      'model-a',
      'model-a',
      'model-b',
      'model-c',
      'model-chair',
    ])
    expect(asks[0]?.system).toContain('证据秘书')
    expect(asks.slice(1, 4).every((item) => item.system.includes('strict'))).toBe(true)
    expect(asks[4]?.system).toContain('chair')
    expect(persist).toHaveBeenCalledTimes(6)
    expect(report).toContain('3 名独立委员 + 1 名主席')
    expect(report).toContain('result-5')
  })

  it('resumes after completed evidence and reviewers without repeating their calls', async () => {
    const current = task()
    current.evidence = ['saved evidence']
    current.reviewerReports = ['saved reviewer 1', 'saved reviewer 2']
    const models: string[] = []
    await runPdfReviewTask(current, {
      readAiSettings: () => defaultAiSettings(),
      persist: vi.fn(),
      parse: async () => ({ ok: true, kind: 'text', text: 'short PDF text' }),
      ask: async (_settings, model) => {
        models.push(model)
        return `new ${model}`
      },
    })
    expect(models).toEqual(['model-c', 'model-chair'])
  })
})
