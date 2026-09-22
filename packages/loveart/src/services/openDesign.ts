import catalogJson from '../data/openDesignCatalog.json'

export type OpenDesignSurface = 'image' | 'video'
export type OpenDesignLocale = 'en' | 'zh'

interface OpenDesignLocalization {
  name?: string
  title?: string
  category?: string
  summary?: string
  designPrompt?: string
  tokensExcerpt?: string
  tags?: string[]
  prompt?: string
}

interface OpenDesignLocalizations {
  zh?: OpenDesignLocalization
}

export interface OpenDesignSource {
  repo: string
  path?: string
  license: string
  url?: string
}

export interface OpenDesignCatalogSource {
  repo: string
  commit: string
  license: string
  importedAt: string
}

export interface OpenDesignSystem {
  id: string
  name: string
  category: string
  summary: string
  designPrompt: string
  tokensExcerpt: string
  localized?: OpenDesignLocalizations
  source: OpenDesignSource
}

export interface OpenDesignTemplate {
  id: string
  surface: OpenDesignSurface
  title: string
  summary: string
  category: string
  tags: string[]
  model: string
  aspect: string
  prompt: string
  previewImageUrl?: string
  previewVideoUrl?: string
  localized?: OpenDesignLocalizations
  source: OpenDesignSource
}

export interface OpenDesignCatalog {
  source: OpenDesignCatalogSource
  designSystems: OpenDesignSystem[]
  promptTemplates: OpenDesignTemplate[]
}

export interface ApplyOpenDesignTemplateOptions {
  brief: string | null | undefined
  aspect: string
  locale?: OpenDesignLocale
  designSystem?: OpenDesignSystem
}

export interface ComposeOpenDesignContextOptions {
  designSystem: OpenDesignSystem
  locale?: OpenDesignLocale
}

const BRIEF_ARGUMENT_NAMES = new Set([
  'brief',
  'subject',
  'topic',
  'product',
  'city',
  'workspace',
  'page',
  'page title',
  'brand',
  'brand name',
  'product name',
  'city name',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid Open Design catalog: ${path} must be an object.`)
  }
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid Open Design catalog: ${path} must be a non-empty string.`)
  }
  return value
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Invalid Open Design catalog: ${path} must be a string when present.`)
  }
  return value
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Open Design catalog: ${path} must be an array.`)
  }
  return value.map((item, index) => requireString(item, `${path}[${index}]`))
}

function validateLocalization(value: unknown, path: string): OpenDesignLocalization {
  const localization = requireRecord(value, path)
  const tags =
    localization.tags === undefined
      ? undefined
      : requireStringArray(localization.tags, `${path}.tags`)

  return {
    name: optionalString(localization.name, `${path}.name`),
    title: optionalString(localization.title, `${path}.title`),
    category: optionalString(localization.category, `${path}.category`),
    summary: optionalString(localization.summary, `${path}.summary`),
    designPrompt: optionalString(localization.designPrompt, `${path}.designPrompt`),
    tokensExcerpt: optionalString(localization.tokensExcerpt, `${path}.tokensExcerpt`),
    prompt: optionalString(localization.prompt, `${path}.prompt`),
    ...(tags === undefined ? {} : { tags }),
  }
}

function validateLocalizations(value: unknown, path: string): OpenDesignLocalizations | undefined {
  if (value === undefined) return undefined

  const localizations = requireRecord(value, path)
  const zh =
    localizations.zh === undefined
      ? undefined
      : validateLocalization(localizations.zh, `${path}.zh`)
  return zh === undefined ? {} : { zh }
}

function validateCatalogSource(value: unknown): OpenDesignCatalogSource {
  const source = requireRecord(value, 'source')
  return {
    repo: requireString(source.repo, 'source.repo'),
    commit: requireString(source.commit, 'source.commit'),
    license: requireString(source.license, 'source.license'),
    importedAt: requireString(source.importedAt, 'source.importedAt'),
  }
}

function validateItemSource(value: unknown, path: string): OpenDesignSource {
  const source = requireRecord(value, path)
  const url = optionalString(source.url, `${path}.url`)
  return {
    repo: requireString(source.repo, `${path}.repo`),
    path: requireString(source.path, `${path}.path`),
    license: requireString(source.license, `${path}.license`),
    ...(url === undefined ? {} : { url }),
  }
}

function validateDesignSystem(value: unknown, index: number): OpenDesignSystem {
  const path = `designSystems[${index}]`
  const system = requireRecord(value, path)
  const localized = validateLocalizations(system.localized, `${path}.localized`)
  return {
    id: requireString(system.id, `${path}.id`),
    name: requireString(system.name, `${path}.name`),
    category: requireString(system.category, `${path}.category`),
    summary: requireString(system.summary, `${path}.summary`),
    designPrompt: requireString(system.designPrompt, `${path}.designPrompt`),
    tokensExcerpt: requireString(system.tokensExcerpt, `${path}.tokensExcerpt`),
    ...(localized === undefined ? {} : { localized }),
    source: validateItemSource(system.source, `${path}.source`),
  }
}

function validateTemplate(value: unknown, index: number): OpenDesignTemplate {
  const path = `promptTemplates[${index}]`
  const template = requireRecord(value, path)
  const surface = requireString(template.surface, `${path}.surface`)
  if (surface !== 'image' && surface !== 'video') {
    throw new Error(`Invalid Open Design catalog: ${path}.surface must be image or video.`)
  }

  const previewImageUrl = optionalString(template.previewImageUrl, `${path}.previewImageUrl`)
  const previewVideoUrl = optionalString(template.previewVideoUrl, `${path}.previewVideoUrl`)
  const localized = validateLocalizations(template.localized, `${path}.localized`)

  return {
    id: requireString(template.id, `${path}.id`),
    surface,
    title: requireString(template.title, `${path}.title`),
    summary: requireString(template.summary, `${path}.summary`),
    category: requireString(template.category, `${path}.category`),
    tags: requireStringArray(template.tags, `${path}.tags`),
    model: requireString(template.model, `${path}.model`),
    aspect: requireString(template.aspect, `${path}.aspect`),
    prompt: requireString(template.prompt, `${path}.prompt`),
    ...(previewImageUrl === undefined ? {} : { previewImageUrl }),
    ...(previewVideoUrl === undefined ? {} : { previewVideoUrl }),
    ...(localized === undefined ? {} : { localized }),
    source: validateItemSource(template.source, `${path}.source`),
  }
}

function validateCatalog(catalog: unknown): OpenDesignCatalog {
  const root = requireRecord(catalog, 'catalog')

  if (!Array.isArray(root.designSystems)) {
    throw new Error('Invalid Open Design catalog: designSystems must be an array.')
  }
  if (!Array.isArray(root.promptTemplates)) {
    throw new Error('Invalid Open Design catalog: promptTemplates must be an array.')
  }

  return {
    source: validateCatalogSource(root.source),
    designSystems: root.designSystems.map(validateDesignSystem),
    promptTemplates: root.promptTemplates.map(validateTemplate),
  }
}

export const OPEN_DESIGN_CATALOG = validateCatalog(catalogJson)

function localizeSystem(system: OpenDesignSystem, locale: OpenDesignLocale): OpenDesignSystem {
  if (locale === 'en') return { ...system }
  const localized = system.localized?.[locale]
  return localized
    ? {
        ...system,
        name: localized.name ?? system.name,
        category: localized.category ?? system.category,
        summary: localized.summary ?? system.summary,
        designPrompt: localized.designPrompt ?? system.designPrompt,
        tokensExcerpt: localized.tokensExcerpt ?? system.tokensExcerpt,
      }
    : { ...system }
}

function localizeTemplate(
  template: OpenDesignTemplate,
  locale: OpenDesignLocale,
): OpenDesignTemplate {
  if (locale === 'en') return { ...template, tags: [...template.tags] }
  const localized = template.localized?.[locale]
  return localized
    ? {
        ...template,
        title: localized.title ?? template.title,
        category: localized.category ?? template.category,
        summary: localized.summary ?? template.summary,
        tags: localized.tags ? [...localized.tags] : [...template.tags],
        prompt: localized.prompt ?? template.prompt,
      }
    : { ...template, tags: [...template.tags] }
}

export function listOpenDesignSystems(locale: OpenDesignLocale = 'en'): OpenDesignSystem[] {
  return OPEN_DESIGN_CATALOG.designSystems.map((system) => localizeSystem(system, locale))
}

export function listOpenDesignTemplates(
  surface?: OpenDesignSurface,
  locale: OpenDesignLocale = 'en',
): OpenDesignTemplate[] {
  const templates = OPEN_DESIGN_CATALOG.promptTemplates
  return (surface ? templates.filter((template) => template.surface === surface) : templates).map(
    (template) => localizeTemplate(template, locale),
  )
}

export function openDesignSystemById(
  id: string | null | undefined,
  locale: OpenDesignLocale = 'en',
): OpenDesignSystem | undefined {
  if (!id) return undefined
  const system = OPEN_DESIGN_CATALOG.designSystems.find((item) => item.id === id)
  return system ? localizeSystem(system, locale) : undefined
}

export function openDesignTemplateById(
  id: string | null | undefined,
  locale: OpenDesignLocale = 'en',
): OpenDesignTemplate | undefined {
  if (!id) return undefined
  const template = OPEN_DESIGN_CATALOG.promptTemplates.find((item) => item.id === id)
  return template ? localizeTemplate(template, locale) : undefined
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function isAppliedOpenDesignPrompt(value: string | null | undefined): boolean {
  const text = value?.trim() ?? ''
  return /^Open Design (template|模板):/m.test(text) || /^(Template prompt|模板提示词):/m.test(text)
}

export function extractOpenDesignBrief(value: string | null | undefined): string | undefined {
  const text = value?.trim() ?? ''
  const match = text.match(/^(?:User brief|用户需求):\s*(.+)$/m)
  return match?.[1]?.trim() || undefined
}

function fillPrompt(prompt: string, brief: string | null | undefined, aspect: string): string {
  const fallbackBrief = cleanText(brief) || 'an original design asset'

  return prompt
    .replace(/\{USER_BRIEF\}/g, fallbackBrief)
    .replace(/\{ASPECT_RATIO\}/g, aspect)
    .replace(
      /\{argument name="([^"]+)" default="([^"]*)"\}/g,
      (_match, name: string, defaultValue: string) =>
        BRIEF_ARGUMENT_NAMES.has(name.trim().toLowerCase()) ? fallbackBrief : defaultValue,
    )
}

export function applyOpenDesignTemplate(
  template: OpenDesignTemplate,
  options: ApplyOpenDesignTemplateOptions,
): string {
  const isZh = options.locale === 'zh'
  const brief = cleanText(options.brief) || (isZh ? '一个原创设计素材' : 'an original design asset')
  const prompt = fillPrompt(template.prompt, brief, options.aspect)
  const parts = isZh
    ? [
        `Open Design 模板: ${template.title}`,
        `用户需求: ${brief}`,
        `目标比例: ${options.aspect}`,
        `模板提示词: ${prompt}`,
      ]
    : [
        `Open Design template: ${template.title}`,
        `User brief: ${brief}`,
        `Target aspect ratio: ${options.aspect}`,
        `Template prompt: ${prompt}`,
      ]

  if (options.designSystem) {
    if (isZh) {
      parts.push(
        `Open Design 设计系统: ${options.designSystem.name}`,
        `设计系统概要: ${options.designSystem.summary}`,
        `设计系统规则: ${options.designSystem.designPrompt}`,
      )
    } else {
      parts.push(
        `Open Design design system: ${options.designSystem.name}`,
        `Design system summary: ${options.designSystem.summary}`,
        `Design system rules: ${options.designSystem.designPrompt}`,
      )
    }
  }

  parts.push(
    `Source: Open Design ${OPEN_DESIGN_CATALOG.source.repo} @ ${OPEN_DESIGN_CATALOG.source.commit}`,
  )

  return parts.join('\n\n').trim()
}

export function composeOpenDesignContext({
  designSystem,
  locale = 'en',
}: ComposeOpenDesignContextOptions): string {
  if (locale === 'zh') {
    return [
      `Open Design 设计系统: ${designSystem.name}`,
      `类别: ${designSystem.category}`,
      `概要: ${designSystem.summary}`,
      `设计契约: ${designSystem.designPrompt}`,
      `Token 锚点: ${designSystem.tokensExcerpt}`,
      '内部契约: 用这个系统塑造构图、字体、色彩、材质和避免事项。除非用户明确要求并允许，不要复制受保护 logo，也不要暗示官方合作关系。',
    ].join('\n')
  }

  return [
    `Open Design design system: ${designSystem.name}`,
    `Category: ${designSystem.category}`,
    `Summary: ${designSystem.summary}`,
    `Design contract: ${designSystem.designPrompt}`,
    `Token anchors: ${designSystem.tokensExcerpt}`,
    'Internal contract: Shape composition, typography, palette, materials, and avoid-list from this system. Do not copy protected logos or claim official affiliation unless the user explicitly requests allowed usage.',
  ].join('\n')
}
