export type Lang =
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'th'
  | 'id'
  | 'ru'
  | 'ar'
  | 'pt'
  | 'it'
  | 'pl'
  | 'nl'
  | 'ms'
  | 'he'
  | 'hi'
  | 'zh-TW'

export const LANGS: readonly Lang[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'th',
  'id',
  'ru',
  'ar',
  'pt',
  'it',
  'pl',
  'nl',
  'ms',
  'he',
  'hi',
  'zh-TW',
]

/** Shared language picker options, ordered by ISO 639 code. */
export const LANGUAGE_OPTIONS = [
  { value: 'ar', label: 'العربية', englishName: 'Arabic' },
  { value: 'de', label: 'Deutsch', englishName: 'German' },
  { value: 'en', label: 'English', englishName: 'English' },
  { value: 'es', label: 'Español', englishName: 'Spanish' },
  { value: 'fr', label: 'Français', englishName: 'French' },
  { value: 'he', label: 'עברית', englishName: 'Hebrew' },
  { value: 'hi', label: 'हिन्दी', englishName: 'Hindi' },
  { value: 'id', label: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { value: 'it', label: 'Italiano', englishName: 'Italian' },
  { value: 'ja', label: '日本語', englishName: 'Japanese' },
  { value: 'ko', label: '한국어', englishName: 'Korean' },
  { value: 'ms', label: 'Bahasa Melayu', englishName: 'Malay' },
  { value: 'nl', label: 'Nederlands', englishName: 'Dutch' },
  { value: 'pl', label: 'Polski', englishName: 'Polish' },
  { value: 'pt', label: 'Português', englishName: 'Portuguese' },
  { value: 'ru', label: 'Русский', englishName: 'Russian' },
  { value: 'th', label: 'ไทย', englishName: 'Thai' },
  { value: 'zh', label: '简体中文', englishName: 'Simplified Chinese' },
  { value: 'zh-TW', label: '繁體中文', englishName: 'Traditional Chinese' },
] as const satisfies readonly { value: Lang; label: string; englishName: string }[]

const LANGUAGE_ENGLISH_NAMES = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.value, option.englishName]),
) as Record<Lang, string>

export function languageEnglishName(lang: Lang): string {
  return LANGUAGE_ENGLISH_NAMES[lang]
}

/**
 * System-prompt policy shared by every AI editor. The General language is the
 * primary response language, while an explicitly different user-message
 * language wins for that request. Quoted document context must not switch it.
 */
export function aiReplyLanguageDirective(lang: Lang): string {
  return `\n\nLanguage policy: Use ${languageEnglishName(lang)} as the default reply language. If the user's current request is clearly written in a different language, reply in that language instead. Do not switch languages merely because quoted text, selected document context, retrieved memory, or an attachment uses another language.`
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/** map a raw locale string ('zh-CN', 'zh-Hans', 'ja-JP', 'ko-KR', …) to a supported Lang */
export function normalizeLang(raw: string | null | undefined): Lang {
  const value = raw?.trim().toLowerCase()
  if (!value) return 'en'
  // traditional-script Chinese variants must win over the generic 'zh' prefix
  if (/^zh[-_](tw|hk|mo|hant)/.test(value)) return 'zh-TW'
  for (const lang of LANGS) {
    if (lang !== 'en' && lang !== 'zh-TW' && value.startsWith(lang)) return lang
  }
  // 'in' is the legacy ISO code for Indonesian still reported by some systems
  if (/^in\b/.test(value) || /^in[-_]/.test(value)) return 'id'
  // 'iw' is the legacy ISO code for Hebrew
  if (/^iw\b/.test(value) || /^iw[-_]/.test(value)) return 'he'
  return 'en'
}

const HTML_LANGS: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  th: 'th-TH',
  id: 'id-ID',
  ru: 'ru-RU',
  ar: 'ar-SA',
  pt: 'pt-BR',
  it: 'it-IT',
  pl: 'pl-PL',
  nl: 'nl-NL',
  ms: 'ms-MY',
  he: 'he-IL',
  hi: 'hi-IN',
  'zh-TW': 'zh-TW',
}

/** BCP-47 tag for document.documentElement.lang (drives CSS :lang() and Chromium's per-language font fallback) */
export function htmlLang(lang: Lang): string {
  return HTML_LANGS[lang]
}

// ---- platform-native shortcut hints ----
// Dictionaries write shortcut hints in Mac notation (⌘S, ⇧⌘Z, ⌘+Click); on
// Windows/Linux every translated string is rewritten to Ctrl/Alt/Shift form.

const MAC_KEY_NAMES: Record<string, string> = {
  '⌫': 'Backspace',
  '⌦': 'Delete',
  '⏎': 'Enter',
  '↩': 'Enter',
  '␣': 'Space',
}

const HAS_MAC_SYMBOL = /[⌘⌃⌥⇧⌫⌦⏎↩␣]/
const CHORD = /([⌘⌃⌥⇧]+)(F\d{1,2}|[A-Za-z0-9±=`'\\,./;[\]\-←↑→↓⌫⌦⏎↩␣]|\+)?/g

function chordToWin(mods: string, key: string | undefined): string {
  const parts: string[] = []
  if (mods.includes('⌘') || mods.includes('⌃')) parts.push('Ctrl')
  if (mods.includes('⌥')) parts.push('Alt')
  if (mods.includes('⇧')) parts.push('Shift')
  if (key) parts.push(MAC_KEY_NAMES[key] ?? key)
  return parts.join('+')
}

/** rewrite Mac shortcut notation in a UI string to Windows/Linux form (pure) */
export function macShortcutsToWin(text: string): string {
  if (!HAS_MAC_SYMBOL.test(text)) return text
  return text
    .replace(/⌘\/(?=\p{L}{2})/gu, '') // "⌘/Ctrl+Enter" dual-platform listings: keep the Ctrl side
    .replace(CHORD, (_m, mods: string, key: string | undefined) =>
      key === '+' ? `${chordToWin(mods, undefined)}+` : chordToWin(mods, key),
    )
    .replace(/[⌫⌦⏎↩␣]/g, (glyph) => MAC_KEY_NAMES[glyph] ?? glyph)
}

const IS_MAC = (() => {
  const g = globalThis as {
    navigator?: { platform?: string }
    process?: { platform?: string }
  }
  if (g.navigator?.platform) return /mac/i.test(g.navigator.platform)
  return g.process?.platform === 'darwin'
})()

/** platform-aware shortcut display: identity on macOS */
export const platformShortcuts: (text: string) => string = IS_MAC
  ? (text) => text
  : macShortcutsToWin

export type Params = Record<string, string | number>

/** fill {name} placeholders; unknown placeholders are left as-is */
export function format(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** per-language dictionaries; zh defines the key set, all others must match it */
export type LangDicts<D extends Record<string, string>> = { zh: D } & {
  [L in Exclude<Lang, 'zh'>]: Record<keyof D, string>
}

/**
 * Identity helper for dictionary shards: keeps literal key inference while
 * type-checking that every other language covers exactly the zh key set.
 */
export function defineStrings<D extends Record<string, string>>(dicts: LangDicts<D>): LangDicts<D> {
  return dicts
}

// ---- process-wide current language ----
// Used by Electron main-process code (shell + editor main modules share one
// bundle, so one holder). Renderers get the language over IPC instead.

let uiLang: Lang = 'zh'
const langListeners = new Set<(lang: Lang) => void>()

export function getUiLang(): Lang {
  return uiLang
}

export function setUiLang(lang: Lang): void {
  if (lang === uiLang) return
  uiLang = lang
  for (const listener of langListeners) listener(lang)
}

export function onUiLangChange(listener: (lang: Lang) => void): () => void {
  langListeners.add(listener)
  return () => langListeners.delete(listener)
}

/**
 * Build a translator over per-language dictionaries. The zh dictionary defines
 * the key set; every other language must cover exactly the same keys
 * (compile-time checked), so a missing translation is a type error, not a
 * runtime fallback.
 */
export function createI18n<D extends Record<string, string>>(dicts: LangDicts<D>) {
  return (lang: Lang, key: keyof D, params?: Params): string =>
    platformShortcuts(format(dicts[lang][key], params))
}
