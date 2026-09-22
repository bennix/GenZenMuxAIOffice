import { describe, expect, it } from 'vitest'
import {
  VIDEO_DIRECTOR_GUIDE,
  buildVideoKnowledgeContext,
  retrieveVideoKnowledgeCards,
} from './videoKnowledge'

describe('videoKnowledge retrieval', () => {
  it('matches camera language to camera guidance', () => {
    const cards = retrieveVideoKnowledgeCards({
      prompt: 'A slow push-in tracking shot around a glass product with low angle camera movement',
      mode: 'video',
      hasReferences: false,
      duration: 5,
    })

    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]?.id).toBe('camera-intent')
    expect(cards.map((card) => card.id)).toContain('temporal-rhythm')
  })

  it('boosts reference preservation guidance when references are present', () => {
    const cards = retrieveVideoKnowledgeCards({
      prompt: 'Animate this reference image into a premium product reveal',
      mode: 'video',
      hasReferences: true,
      duration: 5,
    })

    expect(cards[0]?.id).toBe('reference-continuity')
    expect(cards.map((card) => card.id)).toContain('physical-causality')
  })

  it('returns no cards for image mode by default', () => {
    const cards = retrieveVideoKnowledgeCards({
      prompt: 'Create a poster with cinematic lighting',
      mode: 'image',
      hasReferences: false,
    })

    expect(cards).toEqual([])
  })

  it('formats a bounded internal context', () => {
    const context = buildVideoKnowledgeContext({
      prompt: 'The camera glides through warm light as fabric drifts in slow motion',
      mode: 'video',
      hasReferences: false,
      duration: 5,
    })
    expect(context).toBeDefined()
    const rendered = context ?? ''

    expect(rendered).toContain('General World Model director guide')
    expect(rendered).toContain(VIDEO_DIRECTOR_GUIDE.split('\n')[0])
    expect(rendered).toContain('Relevant book-derived knowledge cards')
    expect((rendered.match(/Knowledge card:/g) ?? []).length).toBeLessThanOrEqual(4)
  })
})
