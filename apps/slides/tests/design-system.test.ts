import { describe, expect, it, vi } from 'vitest'
import { DECK_DESIGNS, designCandidates, designContract } from '../src/renderer/ai/design-system'
import { createSlidesSkill, type DeckAccess } from '../src/renderer/ai/slides-skill'

describe('deck design constraints', () => {
  it('offers three different directions, using the subject to rank the first', () => {
    expect(designCandidates('工程系统架构')[0]!.id).toBe('blueprint')
    expect(new Set(designCandidates('品牌故事').map((style) => style.id)).size).toBe(3)
  })
  it('locks palette, readable scale and safe margins for every selected design', () => {
    for (const design of DECK_DESIGNS) {
      const contract = designContract(design)
      expect(contract).toContain(design.accent)
      expect(contract).toContain('body >= 32px')
      expect(contract).toContain('32px bottom safe area')
      expect(designContract(design, true)).toContain('body >= 38px')
    }
  })
  it('cancelling design choice stops before style or page generation', async () => {
    const generateStyleSkill = vi.fn()
    const generatePageCloud = vi.fn()
    const access: DeckAccess = {
      getSlides: () => [],
      getCurrent: () => 0,
      getSelectedIds: () => [],
      applySlide: () => {},
      applyDeck: () => {},
      fitWidthPx: 1280,
      chooseDeckStyle: async () => null,
      generateStyleSkill,
      generatePageCloud,
      isCloudPageGenEnabled: async () => true,
      generateFromHtml: async () => ({ ok: true }),
    }
    const result = await createSlidesSkill(access).executeTool({
      id: 'choice',
      name: 'generate_deck',
      input: { topic: '设计测试', approx_pages: 3 },
    })
    expect(result.mutated).toBe(false)
    expect(generateStyleSkill).not.toHaveBeenCalled()
    expect(generatePageCloud).not.toHaveBeenCalled()
  })
})
