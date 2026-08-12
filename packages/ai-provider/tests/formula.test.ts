import { describe, expect, it } from 'vitest'
import { cleanRecognizedLatex, formulaRecognitionSettings } from '../src/formula'
import { defaultAiSettings } from '../src/providers'

describe('formula recognition helpers', () => {
  it('removes common model wrappers without changing the formula', () => {
    expect(cleanRecognizedLatex('```latex\n\\frac{a}{b}\n```')).toBe('\\frac{a}{b}')
    expect(cleanRecognizedLatex('$$ x^2 + y^2 $$')).toBe('x^2 + y^2')
    expect(cleanRecognizedLatex('\\[\\sum_i x_i\\]')).toBe('\\sum_i x_i')
  })

  it('keeps credentials and selects the ZenMux vision model', () => {
    const settings = defaultAiSettings()
    settings.providers.zenmux.apiKey = 'secret'
    const result = formulaRecognitionSettings(settings)
    expect(result.provider).toBe('zenmux')
    expect(result.providers.zenmux.apiKey).toBe('secret')
    expect(result.providers.zenmux.model).toBe('z-ai/glm-5v-turbo')
  })
})
