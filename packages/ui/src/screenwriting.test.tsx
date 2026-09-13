import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadScreenwritingSkill,
  screenplayParagraphs,
  screenwritingPrompt,
  SCREENWRITING_REVISION,
} from './screenwriting'

afterEach(() => vi.unstubAllGlobals())
describe('screenwriting integration', () => {
  it('routes tasks and preserves source and medium', () => {
    const prompt = screenwritingPrompt(
      'sw-scene-craft',
      '舞台剧',
      '两人对峙',
      '门口相遇',
      '技能方法',
    )
    expect(prompt.system).toContain('目标、阻力和价值变化')
    expect(prompt.system).toContain('技能方法')
    expect(prompt.user).toContain('舞台剧')
    expect(prompt.user).toContain('门口相遇')
    expect(screenwritingPrompt('sw-workflow', '电影', '', '剧本', '方法').system).toContain(
      '只输出问题',
    )
  })
  it('requires material for editing and diagnoses', () => {
    expect(() => screenwritingPrompt('sw-premise-theme', '电影', '', '', '')).toThrow('创作要求')
    for (const task of ['sw-workflow', 'sw-dialogue', 'sw-format-adaptation'] as const)
      expect(() => screenwritingPrompt(task, '电影', '改进', '', '')).toThrow('剧本素材')
  })
  it('loads a pinned skill and reuses it, without fetching user material', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('---\nname: sw-scene-craft\n---\n# 场景方法'))
    vi.stubGlobal('fetch', fetcher)
    expect(await loadScreenwritingSkill('sw-scene-craft')).toContain('场景方法')
    await loadScreenwritingSkill('sw-scene-craft')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toContain(
      `${SCREENWRITING_REVISION}/plugins/screenwriting/skills/sw-scene-craft/SKILL.md`,
    )
  })
  it('retries after a failed skill request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('---\nname: sw-dialogue\n---\n# 对白'))
    vi.stubGlobal('fetch', fetcher)
    await expect(loadScreenwritingSkill('sw-dialogue')).rejects.toThrow('503')
    await expect(loadScreenwritingSkill('sw-dialogue')).resolves.toContain('对白')
  })
  it('inserts literal text with line breaks, never generated HTML', () => {
    expect(screenplayParagraphs('剧本', 'docParagraph')[0]?.type).toBe('docParagraph')
    expect(screenplayParagraphs('内景\r\n\r\n<script>unsafe()</script>')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '内景' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: '<script>unsafe()</script>' }] },
    ])
  })
})
