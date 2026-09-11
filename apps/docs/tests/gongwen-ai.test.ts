import { expect, it } from 'vitest'
import { gongwenAiPrompt, cleanGongwenAiDraft } from '../src/renderer/ai/gongwen-ai'

it('includes actual fields, source and task while keeping layout outside AI output', () => {
  const prompt = gongwenAiPrompt('draft', '起草报告', '已完成 12 项任务', {
    format: 'formal',
    title: '工作报告',
    'doc-no': '测试发〔2026〕1号',
  })
  expect(prompt.user).toContain('测试发〔2026〕1号')
  expect(prompt.user).toContain('已完成 12 项任务')
  expect(prompt.system).toContain('不编造')
  expect(prompt.system).toContain('不重复输出总标题')
})
it('reviews without creating replacement content and polishes without changing facts', () => {
  expect(gongwenAiPrompt('review', '', '正文', {}).system).toContain('只输出检查建议')
  expect(gongwenAiPrompt('polish', '', '正文', {}).system).toContain('保留全部事实')
})
it('rejects empty requests and cleans fenced responses', () => {
  expect(() => gongwenAiPrompt('draft', '', '', {})).toThrow('要求')
  expect(() => gongwenAiPrompt('review', '检查', '', {})).toThrow('正文')
  expect(cleanGongwenAiDraft('```markdown\n一、工作安排\n```')).toBe('一、工作安排')
  expect(() => cleanGongwenAiDraft('  ')).toThrow('有效内容')
})
