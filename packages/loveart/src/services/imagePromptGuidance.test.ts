import { expect, it } from 'vitest'
import { sketchReferenceGuidance } from './imagePromptGuidance'
import { normalizeSeedModels } from '../store/settingsStore'

it('adds both requested models on settings migration without changing an existing default', () => {
  const models = normalizeSeedModels([
    { id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true },
  ])
  expect(models.filter((m) => m.id.startsWith('openai/gpt-image-2.5')).map((m) => m.id)).toEqual([
    'openai/gpt-image-2.5-flare',
    'openai/gpt-image-2.5-sunburst',
  ])
  expect(models.find((m) => m.category === 'image' && m.isDefault)?.id).toBe('openai/gpt-image-2')
})
it('numbers sketch references in attachment order and rejects invalid indices', () => {
  expect(sketchReferenceGuidance([1, 1, -1, 8], 3, 'en')).toContain('images 2')
  expect(sketchReferenceGuidance([5], 1, 'zh')).toBe('')
})
