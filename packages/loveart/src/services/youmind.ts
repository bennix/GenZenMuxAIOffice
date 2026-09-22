import catalogJson from '../data/youmindCatalog.json'

export type YouMindLocale = 'en' | 'zh'

export interface YouMindSource {
  id: string
  name: string
  url: string
  licenseNote: string
  model: string
  importedAt: string
}

export interface YouMindSourceRef {
  name: string
  url: string
  licenseNote: string
}

export interface YouMindLocalization {
  title?: string
  summary?: string
  category?: string
  tags?: string[]
  prompt?: string
  guidance?: string
}

export interface YouMindLocalizations {
  zh?: YouMindLocalization
}

export interface YouMindCategory {
  id: string
  title: string
  summary: string
  tags: string[]
  sourceUrl: string
  sourceCountLabel?: string
  previewImageUrl?: string
  guidance: string
  localized?: YouMindLocalizations
}

export interface YouMindTemplate {
  id: string
  surface: 'image'
  title: string
  summary: string
  categoryId: string
  category: string
  tags: string[]
  model: string
  aspect: string
  prompt: string
  previewImageUrl?: string
  source: YouMindSourceRef
  localized?: YouMindLocalizations
}

export interface YouMindCatalog {
  source: YouMindSource
  categories: YouMindCategory[]
  promptTemplates: YouMindTemplate[]
}

export interface ApplyYouMindTemplateOptions {
  brief?: string | null
  aspect: string
  locale?: YouMindLocale
  category?: YouMindCategory | null
}

export interface ComposeYouMindGuidanceOptions {
  category?: YouMindCategory | null
  locale?: YouMindLocale
}

export interface YouMindImportPack {
  source: {
    id: string
    name: string
    url: string
    license: string
  }
  importedAt: string
  categories: Array<{
    id: string
    title: string
    summary: string
    tags: string[]
    sourceUrl: string
  }>
  items: Array<{
    id: string
    title: string
    prompt: string
    categoryId: string
    tags: string[]
    model: string
    aspect: string
    sourceUrl: string
    license: string
  }>
}

type ReadonlyDeep<T> =
  T extends Array<infer Item>
    ? ReadonlyArray<ReadonlyDeep<Item>>
    : T extends object
      ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
      : T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid YouMind catalog: ${path} must be an object.`)
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid YouMind catalog: ${path} must be a non-empty string.`)
  }
  return value
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Invalid YouMind catalog: ${path} must be a string when present.`)
  }
  return value
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid YouMind catalog: ${path} must be an array.`)
  }
  return value.map((item, index) => requireString(item, `${path}[${index}]`))
}

function validateLocalization(value: unknown, path: string): YouMindLocalization {
  const loc = requireRecord(value, path)
  return {
    title: optionalString(loc.title, `${path}.title`),
    summary: optionalString(loc.summary, `${path}.summary`),
    category: optionalString(loc.category, `${path}.category`),
    tags: loc.tags === undefined ? undefined : requireStringArray(loc.tags, `${path}.tags`),
    prompt: optionalString(loc.prompt, `${path}.prompt`),
    guidance: optionalString(loc.guidance, `${path}.guidance`),
  }
}

function validateLocalizations(value: unknown, path: string): YouMindLocalizations | undefined {
  if (value === undefined) return undefined
  const localized = requireRecord(value, path)
  const zh =
    localized.zh === undefined ? undefined : validateLocalization(localized.zh, `${path}.zh`)
  return zh === undefined ? {} : { zh }
}

function validateSource(value: unknown): YouMindSource {
  const source = requireRecord(value, 'source')
  return {
    id: requireString(source.id, 'source.id'),
    name: requireString(source.name, 'source.name'),
    url: requireString(source.url, 'source.url'),
    licenseNote: requireString(source.licenseNote, 'source.licenseNote'),
    model: requireString(source.model, 'source.model'),
    importedAt: requireString(source.importedAt, 'source.importedAt'),
  }
}

function validateSourceRef(value: unknown, path: string): YouMindSourceRef {
  const source = requireRecord(value, path)
  return {
    name: requireString(source.name, `${path}.name`),
    url: requireString(source.url, `${path}.url`),
    licenseNote: requireString(source.licenseNote, `${path}.licenseNote`),
  }
}

function validateCategory(value: unknown, index: number): YouMindCategory {
  const path = `categories[${index}]`
  const category = requireRecord(value, path)
  return {
    id: requireString(category.id, `${path}.id`),
    title: requireString(category.title, `${path}.title`),
    summary: requireString(category.summary, `${path}.summary`),
    tags: requireStringArray(category.tags, `${path}.tags`),
    sourceUrl: requireString(category.sourceUrl, `${path}.sourceUrl`),
    sourceCountLabel: optionalString(category.sourceCountLabel, `${path}.sourceCountLabel`),
    previewImageUrl: optionalString(category.previewImageUrl, `${path}.previewImageUrl`),
    guidance: requireString(category.guidance, `${path}.guidance`),
    localized: validateLocalizations(category.localized, `${path}.localized`),
  }
}

function validateTemplate(value: unknown, index: number): YouMindTemplate {
  const path = `promptTemplates[${index}]`
  const template = requireRecord(value, path)
  const surface = requireString(template.surface, `${path}.surface`)
  if (surface !== 'image') {
    throw new Error(`Invalid YouMind catalog: ${path}.surface must be image.`)
  }
  return {
    id: requireString(template.id, `${path}.id`),
    surface,
    title: requireString(template.title, `${path}.title`),
    summary: requireString(template.summary, `${path}.summary`),
    categoryId: requireString(template.categoryId, `${path}.categoryId`),
    category: requireString(template.category, `${path}.category`),
    tags: requireStringArray(template.tags, `${path}.tags`),
    model: requireString(template.model, `${path}.model`),
    aspect: requireString(template.aspect, `${path}.aspect`),
    prompt: requireString(template.prompt, `${path}.prompt`),
    previewImageUrl: optionalString(template.previewImageUrl, `${path}.previewImageUrl`),
    source: validateSourceRef(template.source, `${path}.source`),
    localized: validateLocalizations(template.localized, `${path}.localized`),
  }
}

function validateCatalog(catalog: unknown): YouMindCatalog {
  const root = requireRecord(catalog, 'catalog')
  if (!Array.isArray(root.categories)) {
    throw new Error('Invalid YouMind catalog: categories must be an array.')
  }
  if (!Array.isArray(root.promptTemplates)) {
    throw new Error('Invalid YouMind catalog: promptTemplates must be an array.')
  }
  return {
    source: validateSource(root.source),
    categories: root.categories.map(validateCategory),
    promptTemplates: root.promptTemplates.map(validateTemplate),
  }
}

function cloneLocalization(localization: YouMindLocalization): YouMindLocalization {
  return {
    ...localization,
    tags: localization.tags === undefined ? undefined : [...localization.tags],
  }
}

function cloneLocalizations(
  localizations: YouMindLocalizations | undefined,
): YouMindLocalizations | undefined {
  if (localizations === undefined) return undefined
  return {
    zh: localizations.zh === undefined ? undefined : cloneLocalization(localizations.zh),
  }
}

function cloneSource(source: YouMindSource): YouMindSource {
  return { ...source }
}

function cloneSourceRef(source: YouMindSourceRef): YouMindSourceRef {
  return { ...source }
}

function cloneCategory(category: YouMindCategory): YouMindCategory {
  return {
    ...category,
    tags: [...category.tags],
    localized: cloneLocalizations(category.localized),
  }
}

function cloneTemplate(template: YouMindTemplate): YouMindTemplate {
  return {
    ...template,
    tags: [...template.tags],
    source: cloneSourceRef(template.source),
    localized: cloneLocalizations(template.localized),
  }
}

function cloneCatalog(catalog: YouMindCatalog): YouMindCatalog {
  return {
    source: cloneSource(catalog.source),
    categories: catalog.categories.map(cloneCategory),
    promptTemplates: catalog.promptTemplates.map(cloneTemplate),
  }
}

function deepFreeze<T>(value: T): ReadonlyDeep<T> {
  if (typeof value !== 'object' || value === null) return value as ReadonlyDeep<T>
  Object.freeze(value)
  Object.values(value as Record<string, unknown>).forEach((child) => {
    if (typeof child === 'object' && child !== null && !Object.isFrozen(child)) {
      deepFreeze(child)
    }
  })
  return value as ReadonlyDeep<T>
}

function localizeCategory(category: YouMindCategory, locale: YouMindLocale): YouMindCategory {
  const localizations = cloneLocalizations(category.localized)
  if (locale === 'en') return { ...category, tags: [...category.tags], localized: localizations }
  const localization = category.localized?.[locale]
  return localization
    ? {
        ...category,
        title: localization.title ?? category.title,
        summary: localization.summary ?? category.summary,
        tags: localization.tags ? [...localization.tags] : [...category.tags],
        guidance: localization.guidance ?? category.guidance,
        localized: localizations,
      }
    : { ...category, tags: [...category.tags], localized: localizations }
}

function localizeTemplate(template: YouMindTemplate, locale: YouMindLocale): YouMindTemplate {
  const source = { ...template.source }
  const localizations = cloneLocalizations(template.localized)
  if (locale === 'en')
    return { ...template, tags: [...template.tags], source, localized: localizations }
  const localization = template.localized?.[locale]
  return localization
    ? {
        ...template,
        title: localization.title ?? template.title,
        summary: localization.summary ?? template.summary,
        category: localization.category ?? template.category,
        tags: localization.tags ? [...localization.tags] : [...template.tags],
        prompt: localization.prompt ?? template.prompt,
        source,
        localized: localizations,
      }
    : { ...template, tags: [...template.tags], source, localized: localizations }
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

function fillPrompt(prompt: string, brief: string | null | undefined, aspect: string): string {
  const fallbackBrief = cleanText(brief) || 'an original design asset'
  return prompt.split('{USER_BRIEF}').join(fallbackBrief).split('{ASPECT_RATIO}').join(aspect)
}

export function isAppliedYouMindPrompt(value: string | null | undefined): boolean {
  const text = value?.trim() ?? ''
  return (
    /^YouMind GPT Image 2 (template|模板):/m.test(text) ||
    /^(Template prompt|模板提示词):/m.test(text)
  )
}

export function extractYouMindBrief(value: string | null | undefined): string | undefined {
  const text = value?.trim() ?? ''
  const match = text.match(/^(?:User brief|用户需求):\s*(.+)$/m)
  return match?.[1]?.trim() || undefined
}

const INTERNAL_YOUMIND_CATALOG = validateCatalog(catalogJson)

export const YOUMIND_CATALOG: ReadonlyDeep<YouMindCatalog> = deepFreeze(
  cloneCatalog(INTERNAL_YOUMIND_CATALOG),
)

export function listYouMindCategories(locale: YouMindLocale = 'en'): YouMindCategory[] {
  return INTERNAL_YOUMIND_CATALOG.categories.map((category) => localizeCategory(category, locale))
}

export function listYouMindTemplates(locale: YouMindLocale = 'en'): YouMindTemplate[] {
  return INTERNAL_YOUMIND_CATALOG.promptTemplates.map((template) =>
    localizeTemplate(template, locale),
  )
}

export function youMindCategoryById(
  id: string | null | undefined,
  locale: YouMindLocale = 'en',
): YouMindCategory | undefined {
  if (!id) return undefined
  const category = INTERNAL_YOUMIND_CATALOG.categories.find((item) => item.id === id)
  return category ? localizeCategory(category, locale) : undefined
}

export function youMindTemplateById(
  id: string | null | undefined,
  locale: YouMindLocale = 'en',
): YouMindTemplate | undefined {
  if (!id) return undefined
  const template = INTERNAL_YOUMIND_CATALOG.promptTemplates.find((item) => item.id === id)
  return template ? localizeTemplate(template, locale) : undefined
}

export function applyYouMindTemplate(
  template: YouMindTemplate,
  options: ApplyYouMindTemplateOptions,
): string {
  const locale = options.locale ?? 'en'
  const brief =
    cleanText(options.brief) || (locale === 'zh' ? '一个原创设计素材' : 'an original design asset')
  const prompt = fillPrompt(template.prompt, brief, options.aspect)
  const category = options.category
  if (locale === 'zh') {
    return [
      `YouMind GPT Image 2 模板: ${template.title}`,
      `用户需求: ${brief}`,
      `目标比例: ${options.aspect}`,
      category ? `分类指引: ${category.guidance}` : undefined,
      `模板提示词: ${prompt}`,
      `来源: YouMind GPT Image 2 (${template.source.url})`,
      `归因说明: ${template.source.licenseNote}`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    `YouMind GPT Image 2 template: ${template.title}`,
    `User brief: ${brief}`,
    `Target aspect ratio: ${options.aspect}`,
    category ? `Category guidance: ${category.guidance}` : undefined,
    `Template prompt: ${prompt}`,
    `Source: YouMind GPT Image 2 (${template.source.url})`,
    `Attribution note: ${template.source.licenseNote}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function composeYouMindGuidance({
  category,
  locale = 'en',
}: ComposeYouMindGuidanceOptions): string | undefined {
  if (!category) return undefined
  if (locale === 'zh') {
    return [
      `YouMind GPT Image 2 来源: ${category.title}`,
      `分类概要: ${category.summary}`,
      `分类提示: ${category.guidance}`,
      '内部提示: 将这些要求作为 GPT Image 2 图像提示词写作约束。强调明确主体、构图、材质、可读文字、使用场景和避免项。不要声称复制了 YouMind 原始提示词或图片。',
    ].join('\n')
  }
  return [
    `YouMind GPT Image 2 source: ${category.title}`,
    `Category summary: ${category.summary}`,
    `Category guidance: ${category.guidance}`,
    'Internal instruction: Treat this as GPT Image 2 prompt-writing guidance. Emphasize clear subject, composition, material detail, readable text, use case, and avoid-list constraints. Do not claim source prompts or source images were copied.',
  ].join('\n')
}

function requireImportString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid YouMind import pack: ${path} must be a non-empty string.`)
  }
  return value
}

function validateImportStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid YouMind import pack: ${path} must be an array.`)
  }
  value.forEach((item, index) => requireImportString(item, `${path}[${index}]`))
}

export function validateYouMindImportPack(pack: unknown): pack is YouMindImportPack {
  const root = isRecord(pack) ? pack : undefined
  if (!root) throw new Error('Invalid YouMind import pack: root must be an object.')
  const source = isRecord(root.source) ? root.source : undefined
  if (!source) throw new Error('Invalid YouMind import pack: source must be an object.')
  requireImportString(source.id, 'source.id')
  requireImportString(source.name, 'source.name')
  requireImportString(source.url, 'source.url')
  requireImportString(source.license, 'source.license')
  requireImportString(root.importedAt, 'importedAt')
  if (!Array.isArray(root.categories)) {
    throw new Error('Invalid YouMind import pack: categories must be an array.')
  }
  if (!Array.isArray(root.items)) {
    throw new Error('Invalid YouMind import pack: items must be an array.')
  }
  const categoryIds = new Set<string>()
  root.categories.forEach((value, index) => {
    const category = isRecord(value) ? value : undefined
    if (!category)
      throw new Error(`Invalid YouMind import pack: categories[${index}] must be an object.`)
    const id = requireImportString(category.id, `categories[${index}].id`)
    categoryIds.add(id)
    requireImportString(category.title, `categories[${index}].title`)
    requireImportString(category.summary, `categories[${index}].summary`)
    validateImportStringArray(category.tags, `categories[${index}].tags`)
    requireImportString(category.sourceUrl, `categories[${index}].sourceUrl`)
  })
  root.items.forEach((value, index) => {
    const item = isRecord(value) ? value : undefined
    if (!item) throw new Error(`Invalid YouMind import pack: items[${index}] must be an object.`)
    requireImportString(item.id, `items[${index}].id`)
    requireImportString(item.title, `items[${index}].title`)
    requireImportString(item.prompt, `items[${index}].prompt`)
    const categoryId = requireImportString(item.categoryId, `items[${index}].categoryId`)
    if (!categoryIds.has(categoryId)) {
      throw new Error(
        `Invalid YouMind import pack: items[${index}].categoryId must reference a category id from categories.`,
      )
    }
    validateImportStringArray(item.tags, `items[${index}].tags`)
    requireImportString(item.model, `items[${index}].model`)
    requireImportString(item.aspect, `items[${index}].aspect`)
    requireImportString(item.sourceUrl, `items[${index}].sourceUrl`)
    requireImportString(item.license, `items[${index}].license`)
  })
  return true
}
