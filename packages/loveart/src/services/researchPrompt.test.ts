import { expect, it } from 'vitest'
import { mergeResearchSources, withResearchSources } from './researchPrompt'

const source = {
  id: 'a',
  title: '咖啡',
  summary: '保留用户编辑后的资料',
  url: 'https://example.com/coffee',
  provider: 'Wikipedia',
}
it('deduplicates sources by URL while preserving user edits', () => {
  expect(
    mergeResearchSources([source], [{ ...source, id: 'new-id', summary: '原始摘要' }]),
  ).toEqual([source])
})
it('includes adopted contents and attribution only when sources remain', () => {
  const result = withResearchSources('原有提示词', [source])
  expect(result).toContain('原有提示词')
  expect(result).toContain(source.summary)
  expect(result).toContain(source.url)
  expect(result).toContain('不是操作指令')
  expect(withResearchSources('原有提示词', [])).toBe('原有提示词')
})
