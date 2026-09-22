import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModelEntry } from '../types'
import { videoModels } from '../services/videoModels'

export const INVITE_URL = 'https://zenmux.ai/invite/GBQMC5'
export const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1'
// Video uses ZenMux's Vertex AI–compatible base, not the OpenAI /v1 base.
export const ZENMUX_VERTEX_BASE_URL = 'https://zenmux.ai/api/vertex-ai'
export const CREATIVE_ORCHESTRATOR_MODEL_ID = 'anthropic/claude-sonnet-5'

// Seed registry — REQUIREMENTS.md §3.3
const SEED_MODELS: ModelEntry[] = [
  { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', category: 'image' },
  { id: 'openai/gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', category: 'image' },
  { id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true },
  {
    id: 'google/gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    category: 'image',
  },
  { id: 'bytedance/doubao-seedream-5.0-lite', name: 'Doubao Seedream 5.0 Lite', category: 'image' },
  { id: 'google/gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', category: 'image' },
  ...videoModels.map((m): ModelEntry => ({
    id: m.id,
    name: m.name,
    category: 'video',
    isDefault: m.id === 'bytedance/doubao-seedance-2.0',
  })),
  // Orchestrator chat models. Claude Sonnet 5 is the default backend Agent model;
  // Sonnet 4.6 and Gemini remain available as fallbacks in Settings.
  {
    id: CREATIVE_ORCHESTRATOR_MODEL_ID,
    name: 'Claude Sonnet 5 (creative agent)',
    category: 'chat',
    isDefault: true,
  },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (agent)', category: 'chat' },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (agent)', category: 'chat' },
]

const SEED_MODEL_IDS = new Set(SEED_MODELS.map((model) => model.id))
const LEGACY_SEEDED_CHAT_MODEL_IDS = new Set([
  'anthropic/claude-opus-4.7',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.1-pro-preview',
])
const SEED_MODELS_BY_ID = new Map(SEED_MODELS.map((model) => [model.id, model]))
const MODEL_CATEGORIES: ModelEntry['category'][] = ['image', 'video', 'chat']

function isModelCategory(category: unknown): category is ModelEntry['category'] {
  return MODEL_CATEGORIES.includes(category as ModelEntry['category'])
}

function coerceModelEntry(model: unknown): ModelEntry | undefined {
  if (!model || typeof model !== 'object') return undefined

  const candidate = model as Partial<Record<keyof ModelEntry, unknown>>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  if (!id || !isModelCategory(candidate.category)) return undefined

  const seedModel = SEED_MODELS_BY_ID.get(id)
  if (seedModel && seedModel.category !== candidate.category) return undefined

  const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : id

  return {
    id,
    name,
    category: candidate.category,
    isDefault: Boolean(candidate.isDefault),
  }
}

export function normalizeSeedModels(models: unknown[]): ModelEntry[] {
  const validModels = models
    .map((model) => coerceModelEntry(model))
    .filter((model): model is ModelEntry => Boolean(model))
  const deduped = new Map<string, ModelEntry>()

  for (const model of validModels) {
    if (!deduped.has(model.id)) {
      deduped.set(model.id, { ...model })
    }
  }

  for (const seed of SEED_MODELS) {
    if (!deduped.has(seed.id)) {
      deduped.set(seed.id, { ...seed })
    }
  }

  const normalized = Array.from(deduped.values())
  const defaultIdsByCategory = new Map<ModelEntry['category'], string>()

  for (const category of MODEL_CATEGORIES) {
    const categoryModels = normalized.filter((model) => model.category === category)
    if (categoryModels.length === 0) continue

    if (category === 'chat') {
      const customDefault = validModels.find(
        (model) =>
          model.category === category &&
          model.isDefault &&
          !SEED_MODEL_IDS.has(model.id) &&
          !LEGACY_SEEDED_CHAT_MODEL_IDS.has(model.id),
      )
      const hasCustomDefault =
        customDefault && categoryModels.some((model) => model.id === customDefault.id)
      const seedDefault = SEED_MODELS.find(
        (model) =>
          model.category === category &&
          model.isDefault &&
          categoryModels.some((categoryModel) => categoryModel.id === model.id),
      )
      const fallbackDefault =
        seedDefault?.id ??
        categoryModels.find((model) => model.isDefault)?.id ??
        categoryModels[0].id

      defaultIdsByCategory.set(category, hasCustomDefault ? customDefault.id : fallbackDefault)
      continue
    }

    const existingDefault = validModels.find(
      (model) =>
        model.category === category &&
        model.isDefault &&
        categoryModels.some((categoryModel) => categoryModel.id === model.id),
    )
    const seedDefault = SEED_MODELS.find(
      (model) =>
        model.category === category &&
        model.isDefault &&
        categoryModels.some((categoryModel) => categoryModel.id === model.id),
    )

    defaultIdsByCategory.set(
      category,
      existingDefault?.id ?? seedDefault?.id ?? categoryModels[0].id,
    )
  }

  return normalized.map((model) => ({
    ...model,
    isDefault: model.id === defaultIdsByCategory.get(model.category),
  }))
}

export type Lang = 'zh' | 'en'
export type Theme = 'dark' | 'light' | 'system'

// Resolve a theme setting to a concrete value. 'system' follows prefers-color-scheme.
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface SettingsState {
  apiKey: string
  models: ModelEntry[]
  lang: Lang
  theme: Theme
  setApiKey: (key: string) => void
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  addModel: (m: Omit<ModelEntry, 'isDefault'>) => void
  removeModel: (id: string) => void
  setDefault: (id: string) => void
  defaultModel: (category: ModelEntry['category']) => ModelEntry | undefined
  clearAll: () => void
}

export function normalizeSettingsState(state: unknown): Partial<SettingsState> {
  if (!state || typeof state !== 'object') {
    return { models: normalizeSeedModels([]) }
  }

  const settingsState = state as Partial<SettingsState>
  return {
    ...settingsState,
    models: normalizeSeedModels(Array.isArray(settingsState.models) ? settingsState.models : []),
  }
}

export const normalizePersistedSettings = normalizeSettingsState

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      models: normalizeSeedModels(SEED_MODELS),
      lang: 'zh',
      theme: 'system',
      setApiKey: (key) => set({ apiKey: key.trim() }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      addModel: (m) =>
        set((s) =>
          s.models.some((x) => x.id === m.id)
            ? s
            : { models: [...s.models, { ...m, name: m.name || m.id }] },
        ),
      removeModel: (id) => set((s) => ({ models: s.models.filter((m) => m.id !== id) })),
      setDefault: (id) =>
        set((s) => {
          const target = s.models.find((m) => m.id === id)
          if (!target) return s
          return {
            models: s.models.map((m) =>
              m.category === target.category ? { ...m, isDefault: m.id === id } : m,
            ),
          }
        }),
      defaultModel: (category) => {
        const list = get().models.filter((m) => m.category === category)
        return list.find((m) => m.isDefault) ?? list[0]
      },
      clearAll: () => {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('zenoffice_loveart_'))
          .forEach((key) => localStorage.removeItem(key))
        location.reload()
      },
    }),
    {
      name: 'zenoffice_loveart_settings',
      partialize: (state): Partial<SettingsState> => ({
        models: state.models,
        lang: state.lang,
        theme: state.theme,
      }),
      version: 1,
      migrate: (persisted) => normalizeSettingsState(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeSettingsState(persisted),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.models = normalizeSettingsState(state).models ?? normalizeSeedModels([])
      },
    },
  ),
)
