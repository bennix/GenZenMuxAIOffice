import { beforeEach, expect, it, vi } from 'vitest'
import { referenceToImage, textToImage } from './edits'
import { editImages, generateImage } from './zenmux'
import { useCanvas } from '../store/canvasStore'
import { useSettings } from '../store/settingsStore'

vi.mock('./zenmux', () => ({
  editImages: vi.fn(async () => ['/image.png']),
  generateImage: vi.fn(async () => ['/image.png']),
  generateVideo: vi.fn(),
}))
vi.mock('./assetStore', () => ({
  storeMedia: vi.fn(async () => ({ url: '/image.png' })),
  getAsset: vi.fn(),
}))
vi.mock('./agent', () => ({ optimizePromptForGenerationOrOriginal: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  useCanvas.setState({ cards: [], edges: [], humanScenes: [], viewports: {} })
  useSettings.setState({
    models: [{ id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true }],
  })
})

it.each(['openai/gpt-image-2.5-flare', 'openai/gpt-image-2.5-sunburst'])(
  'sends and records selected %s even if the global default changes',
  async (model) => {
    const ref = new Blob(['reference'], { type: 'image/png' })
    await referenceToImage('p', 'edit', [ref], 1, model)
    await textToImage('p', 'generate', 1, model)
    expect(editImages).toHaveBeenCalledWith([ref], 'edit', { model, n: 1 })
    expect(generateImage).toHaveBeenCalledWith(model, 'generate', '1024x1024', 1)
    expect(useCanvas.getState().cards).toHaveLength(2)
    expect(
      useCanvas.getState().cards.every((card) => card.model === model && card.status === 'ready'),
    ).toBe(true)
  },
)
