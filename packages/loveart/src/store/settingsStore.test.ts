import { describe, expect, it } from 'vitest'
import type { ModelEntry } from '../types'
import {
  CREATIVE_ORCHESTRATOR_MODEL_ID,
  normalizeSettingsState,
  normalizeSeedModels,
} from './settingsStore'

function chatDefaults(models: ModelEntry[]): ModelEntry[] {
  return models.filter((model) => model.category === 'chat' && model.isDefault)
}

function imageDefaults(models: ModelEntry[]): ModelEntry[] {
  return models.filter((model) => model.category === 'image' && model.isDefault)
}

describe('normalizeSeedModels', () => {
  it('seeds Claude Sonnet 5 as the chat default', () => {
    const result = normalizeSeedModels([])

    expect(result.map((model) => model.id)).toContain(CREATIVE_ORCHESTRATOR_MODEL_ID)
    expect(chatDefaults(result).map((model) => model.id)).toEqual([CREATIVE_ORCHESTRATOR_MODEL_ID])
  })

  it('preserves an existing custom chat default', () => {
    const result = normalizeSeedModels([
      { id: 'openai/custom-chat', name: 'Custom', category: 'chat', isDefault: true },
    ])

    expect(result.map((model) => model.id)).toContain(CREATIVE_ORCHESTRATOR_MODEL_ID)
    expect(chatDefaults(result).map((model) => model.id)).toEqual(['openai/custom-chat'])
  })

  it('migrates seeded chat defaults to Claude Sonnet 5', () => {
    const result = normalizeSeedModels([
      {
        id: 'google/gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro (agent)',
        category: 'chat',
        isDefault: true,
      },
    ])

    expect(chatDefaults(result).map((model) => model.id)).toEqual([CREATIVE_ORCHESTRATOR_MODEL_ID])
    expect(result.find((model) => model.id === 'google/gemini-3.1-pro-preview')?.isDefault).toBe(
      false,
    )
  })

  it('migrates the seeded Claude Sonnet 4.6 default to Claude Sonnet 5', () => {
    const result = normalizeSeedModels([
      {
        id: 'anthropic/claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6 (agent)',
        category: 'chat',
        isDefault: true,
      },
    ])

    expect(chatDefaults(result).map((model) => model.id)).toEqual([CREATIVE_ORCHESTRATOR_MODEL_ID])
    expect(result.find((model) => model.id === 'anthropic/claude-sonnet-4.6')?.isDefault).toBe(
      false,
    )
  })

  it('migrates the seeded Claude Opus default to Claude Sonnet 5', () => {
    const result = normalizeSeedModels([
      {
        id: 'anthropic/claude-opus-4.7',
        name: 'Claude Opus 4.7 (creative agent)',
        category: 'chat',
        isDefault: true,
      },
    ])

    expect(chatDefaults(result).map((model) => model.id)).toEqual([CREATIVE_ORCHESTRATOR_MODEL_ID])
    expect(result.find((model) => model.id === 'anthropic/claude-opus-4.7')?.isDefault).toBe(false)
  })

  it('deduplicates models by id', () => {
    const result = normalizeSeedModels([
      {
        id: CREATIVE_ORCHESTRATOR_MODEL_ID,
        name: 'Claude duplicate',
        category: 'chat',
        isDefault: true,
      },
      {
        id: CREATIVE_ORCHESTRATOR_MODEL_ID,
        name: 'Claude duplicate 2',
        category: 'chat',
        isDefault: true,
      },
    ])
    const ids = result.map((model) => model.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects persisted seed ids with mismatched categories', () => {
    const result = normalizeSeedModels([
      {
        id: 'openai/gpt-image-2',
        name: 'Wrong category',
        category: 'chat',
        isDefault: true,
      },
    ])

    expect(result).toContainEqual(
      expect.objectContaining({ id: 'openai/gpt-image-2', category: 'image' }),
    )
    expect(
      result.some((model) => model.id === 'openai/gpt-image-2' && model.category === 'chat'),
    ).toBe(false)
    expect(imageDefaults(result)).toHaveLength(1)
  })
})

describe('normalizeSettingsState', () => {
  it('preserves settings while dropping malformed persisted models', () => {
    const result = normalizeSettingsState({
      apiKey: 'zk-test',
      lang: 'en',
      theme: 'dark',
      models: [
        null,
        { id: '', category: 'chat' },
        { id: 'openai/custom-chat', name: 'Custom', category: 'chat', isDefault: true },
      ],
    })
    const models = result.models ?? []

    expect(result.apiKey).toBe('zk-test')
    expect(result.lang).toBe('en')
    expect(result.theme).toBe('dark')
    expect(models.some((model) => model.id === '')).toBe(false)
    expect(models.map((model) => model.id)).toContain(CREATIVE_ORCHESTRATOR_MODEL_ID)
    expect(chatDefaults(models).map((model) => model.id)).toEqual(['openai/custom-chat'])
  })

  it('normalizes same-version hydrated settings missing Claude Sonnet 5', () => {
    const result = normalizeSettingsState({
      apiKey: 'zk-test',
      lang: 'en',
      theme: 'dark',
      models: [
        { id: 'openai/custom-chat', name: 'Custom', category: 'chat', isDefault: true },
        {
          id: 'google/gemini-3.1-pro-preview',
          name: 'Gemini 3.1 Pro (agent)',
          category: 'chat',
          isDefault: false,
        },
      ],
    })
    const models = result.models ?? []

    expect(result.apiKey).toBe('zk-test')
    expect(result.lang).toBe('en')
    expect(result.theme).toBe('dark')
    expect(models.map((model) => model.id)).toContain(CREATIVE_ORCHESTRATOR_MODEL_ID)
    expect(chatDefaults(models).map((model) => model.id)).toEqual(['openai/custom-chat'])
  })
})
