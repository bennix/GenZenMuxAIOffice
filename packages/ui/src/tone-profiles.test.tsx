import { describe, expect, it, vi } from 'vitest'
import { scanToneOffline } from './tone-profiles'
import { detectTone, toneCoverage } from './less-ai-tone'

const source = (text: string) => [{ id: 0, text, from: 1, context: 'paragraph' }]
describe('explainable tone profiles', () => {
  it('reports exact offsets and does not expand a specific occurrence to all identical text', () => {
    const segments = source('赋能，赋能。')
    const findings = scanToneOffline(segments, 'chinese')
    expect(findings.map(f => f.offset)).toEqual([0, 3])
    expect(toneCoverage(segments, [findings[0]!]).matched).toBe(2)
    expect(toneCoverage(segments, findings).matched).toBe(4)
    expect(scanToneOffline(segments, 'conservative')).toEqual([])
  })
  it('scans English phrases with word boundaries and tolerates normal punctuation', () => {
    expect(scanToneOffline(source('It is worth noting that this works.'), 'english')[0]?.rule).toBe(9)
    expect(scanToneOffline(source('The tapestry museum opens at 10. A—B.'), 'english')).toEqual([])
    expect(scanToneOffline(source('甲——乙——丙——丁'), 'chinese')).toHaveLength(3)
  })
  it('keeps factual protections in every model profile', async () => {
    for (const profile of ['conservative', 'chinese', 'english'] as const) {
      const generate = vi.fn().mockResolvedValue('[]')
      await detectTone(generate, source('Some text'), '', profile)
      expect(generate.mock.calls[0]![0].system).toContain('保留原文事实、数字、限定词')
      expect(generate.mock.calls[0]![0].system).toContain('不添加个人经历')
    }
  })
})
