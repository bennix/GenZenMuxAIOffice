import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  ZENMUX_BASE_URL,
  ZENMUX_DEFAULT_IMAGE_MODEL,
  ZENMUX_MODELS,
  defaultAiSettings,
  resolveAiSettings,
} from '../src/providers'

describe('defaultAiSettings', () => {
  it('gives every provider its default model and an empty key by default', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('zenmux')
    for (const meta of AI_PROVIDERS) {
      expect(settings.providers[meta.id].apiKey).toBe('')
      expect(settings.providers[meta.id].model).toBe(meta.defaultModel)
    }
    expect(settings.providers.custom.baseUrl).toBe('')
    expect(settings.providers.zenmux.baseUrl).toBe(ZENMUX_BASE_URL)
    expect(settings.providers.zenmux.model).toBe(ZENMUX_MODELS[0])
    expect(settings.providers.zenmux.imageModel).toBe(ZENMUX_DEFAULT_IMAGE_MODEL)
    expect(settings.providers.anthropic.baseUrl).toBeUndefined()
  })

  it('applies caller-supplied default keys only to the listed providers', () => {
    const settings = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(settings.providers.anthropic.apiKey).toBe('sk-ant-preset')
    expect(settings.providers.gemini.apiKey).toBe('')
  })
})

describe('resolveAiSettings', () => {
  it('returns fresh defaults when nothing is stored', () => {
    const defaults = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(resolveAiSettings({}, defaults)).toEqual(defaults)
  })

  it('ignores pre-provider credentials from arbitrary external endpoints', () => {
    const defaults = defaultAiSettings()
    const resolved = resolveAiSettings(
      { apiKey: 'legacy-key', model: 'legacy-model', baseUrl: 'https://legacy.example.com/v1' },
      defaults,
    )
    expect(resolved).toEqual(defaults)
    expect(resolved.provider).toBe('zenmux')
    expect(resolved.providers.custom).toEqual({
      apiKey: '',
      model: '',
      baseUrl: '',
    })
  })

  it('merges stored multi-provider settings over the defaults, provider by provider', () => {
    const defaults = defaultAiSettings({ anthropic: 'preset-key' })
    const resolved = resolveAiSettings(
      {
        provider: 'gemini',
        providers: {
          gemini: { apiKey: 'stored-gemini-key', model: 'gemini-2.5-pro' },
        } as never,
      },
      defaults,
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.providers.gemini).toEqual({
      apiKey: 'stored-gemini-key',
      model: 'gemini-2.5-pro',
    })
    // provider not mentioned in stored.providers keeps the computed default
    expect(resolved.providers.anthropic.apiKey).toBe('preset-key')
  })

  it('preserves user-added ZenMux models', () => {
    const resolved = resolveAiSettings(
      {
        provider: 'zenmux',
        providers: {
          zenmux: {
            apiKey: 'zen-key',
            model: 'vendor/new-model',
            models: ['vendor/new-model'],
            baseUrl: ZENMUX_BASE_URL,
          },
        } as never,
      },
      defaultAiSettings(),
    )
    expect(resolved.providers.zenmux.models).toEqual(['vendor/new-model'])
    expect(resolved.providers.zenmux.model).toBe('vendor/new-model')
    expect(resolved.providers.zenmux.imageModel).toBe(ZENMUX_DEFAULT_IMAGE_MODEL)
  })
})
