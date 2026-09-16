import { expect, it, vi } from 'vitest'
import { defaultAiSettings } from './providers'
import { runDocumentReview } from './review-runner'

it('uses independent members then chair, discloses a failed reviewer and does not fabricate evidence', async () => {
  const chat = vi.fn(async (request: any) =>
    request.system.includes('Methods & Statistics')
      ? { ok: false as const, error: 'fixture failure' }
      : { ok: true as const, content: request.system.includes('chair') ? '主席总结' : '独立审稿' },
  )
  const searchEvidence = vi.fn(async () => '真实文献证据')
  const result = await runDocumentReview({
    settings: defaultAiSettings(),
    profileId: 'science',
    language: 'zh',
    text: '研究正文',
    literature: false,
    chat,
    searchEvidence,
  })
  expect(searchEvidence).not.toHaveBeenCalled()
  expect(result.members).toHaveLength(3)
  expect(result.partial).toBe(true)
  expect(result.chair.status).toBe('done')
  expect(chat.mock.calls.at(-1)![0].user).toContain('Failed reviewers: 方法与统计委员')
  expect(result.literatureEvidence).toContain('disabled')
})

it('reports evidence search failure and honors cancellation before model requests', async () => {
  const chat = vi.fn(async () => ({ ok: true as const, content: 'fixture' }))
  const options = {
    settings: defaultAiSettings(),
    profileId: 'science',
    language: 'en' as const,
    text: 'Document',
    literature: true,
    chat,
    searchEvidence: async () => {
      throw new Error('offline')
    },
  }
  const result = await runDocumentReview(options)
  expect(result.literatureEvidence).toContain('offline')
  const controller = new AbortController()
  controller.abort()
  const count = chat.mock.calls.length
  await expect(runDocumentReview({ ...options, signal: controller.signal })).rejects.toThrow()
  expect(chat).toHaveBeenCalledTimes(count)
})
