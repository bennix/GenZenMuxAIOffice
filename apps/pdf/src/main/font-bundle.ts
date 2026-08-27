/**
 * Built-in OFL faces shipped with the PDF module (Liberation metric-compatible
 * core fonts + Noto CJK), used when the original PDF font cannot cover a rebuild.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SENTINEL = 'NotoSansSC-Regular.otf'

function here(): string {
  return typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
}

/** Directory that contains the shipped .ttf/.otf files, or empty-string if missing. */
export function bundledFontsDir(): string {
  const candidates = [
    process.env.GENOFFICE_PDF_FONTS,
    typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'fonts') : '',
    // unpackaged shell main: apps/shell/out/main → apps/pdf/resources/fonts
    join(here(), '../../../pdf/resources/fonts'),
    // pdf main / vitest: apps/pdf/src/main or apps/pdf/out/main
    join(here(), '../../resources/fonts'),
    join(here(), '../resources/fonts'),
    join(process.cwd(), 'resources/fonts'),
    join(process.cwd(), 'apps/pdf/resources/fonts'),
  ]
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, SENTINEL))) return dir
  }
  return ''
}

export function bundledFontPath(fileName: string): string {
  const dir = bundledFontsDir()
  return dir ? join(dir, fileName) : ''
}

const fileCache = new Map<string, Buffer | null>()

export function loadBundledFont(fileName: string): Buffer | null {
  let cached = fileCache.get(fileName)
  if (cached === undefined) {
    cached = null
    const path = bundledFontPath(fileName)
    if (path) {
      try {
        cached = readFileSync(path)
      } catch {
        cached = null
      }
    }
    fileCache.set(fileName, cached)
  }
  return cached
}

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_]/g, '')
    .replace(/^[a-z]{6}\+/, '')

/** Stirling-style name aliases → bundled file (regular face). Longer keys first. */
const FONT_ALIASES: Array<[string, string]> = [
  ['microsoftjhenghei', 'NotoSansTC-Regular.otf'],
  ['microsoftyahei', 'NotoSansSC-Regular.otf'],
  ['pingfangsc', 'NotoSansSC-Regular.otf'],
  ['pingfangtc', 'NotoSansTC-Regular.otf'],
  ['pingfanghk', 'NotoSansTC-Regular.otf'],
  ['hiraginokakugothic', 'NotoSansJP-Regular.otf'],
  ['hiraginokakumincho', 'NotoSerifJP-Regular.otf'],
  ['sourcehanserifsc', 'NotoSerifSC-Regular.otf'],
  ['sourcehanseriftc', 'NotoSerifTC-Regular.otf'],
  ['sourcehanserif', 'NotoSerifSC-Regular.otf'],
  ['timesnewroman', 'LiberationSerif-Regular.ttf'],
  ['liberationserif', 'LiberationSerif-Regular.ttf'],
  ['sourcehansanssc', 'NotoSansSC-Regular.otf'],
  ['sourcehansanstc', 'NotoSansTC-Regular.otf'],
  ['sourcehansans', 'NotoSansSC-Regular.otf'],
  ['liberationsans', 'LiberationSans-Regular.ttf'],
  ['liberationmono', 'LiberationMono-Regular.ttf'],
  ['malgungothic', 'NotoSansKR-Regular.otf'],
  ['applegothic', 'NotoSansKR-Regular.otf'],
  ['applemyungjo', 'NotoSerifJP-Regular.otf'],
  ['msmincho', 'NotoSerifJP-Regular.otf'],
  ['msgothic', 'NotoSansJP-Regular.otf'],
  ['yugothic', 'NotoSansJP-Regular.otf'],
  ['meiryo', 'NotoSansJP-Regular.otf'],
  ['pmingliu', 'NotoSerifTC-Regular.otf'],
  ['mingliu', 'NotoSerifTC-Regular.otf'],
  ['nsimsun', 'NotoSerifSC-Regular.otf'],
  ['simsun', 'NotoSerifSC-Regular.otf'],
  ['simhei', 'NotoSansSC-Regular.otf'],
  ['stsong', 'NotoSerifSC-Regular.otf'],
  ['stheiti', 'NotoSansSC-Regular.otf'],
  ['yahei', 'NotoSansSC-Regular.otf'],
  ['songti', 'NotoSerifSC-Regular.otf'],
  ['heiti', 'NotoSansSC-Regular.otf'],
  ['kaiti', 'NotoSerifSC-Regular.otf'],
  ['fangsong', 'NotoSerifSC-Regular.otf'],
  ['pingfang', 'NotoSansSC-Regular.otf'],
  ['couriernew', 'LiberationMono-Regular.ttf'],
  ['notoserifsc', 'NotoSerifSC-Regular.otf'],
  ['notoseriftc', 'NotoSerifTC-Regular.otf'],
  ['notoserifjp', 'NotoSerifJP-Regular.otf'],
  ['notoserif', 'NotoSerif-Regular.ttf'],
  ['notosanssc', 'NotoSansSC-Regular.otf'],
  ['notosanstc', 'NotoSansTC-Regular.otf'],
  ['notosansjp', 'NotoSansJP-Regular.otf'],
  ['notosanskr', 'NotoSansKR-Regular.otf'],
  ['helvetica', 'LiberationSans-Regular.ttf'],
  ['arial', 'LiberationSans-Regular.ttf'],
  ['tinos', 'LiberationSerif-Regular.ttf'],
  ['times', 'LiberationSerif-Regular.ttf'],
  ['courier', 'LiberationMono-Regular.ttf'],
  ['cousine', 'LiberationMono-Regular.ttf'],
  ['arimo', 'LiberationSans-Regular.ttf'],
  ['batang', 'NotoSerifJP-Regular.otf'],
  ['gulim', 'NotoSansKR-Regular.otf'],
  ['dotum', 'NotoSansKR-Regular.otf'],
  ['malgun', 'NotoSansKR-Regular.otf'],
  ['宋体', 'NotoSerifSC-Regular.otf'],
  ['黑体', 'NotoSansSC-Regular.otf'],
  ['楷体', 'NotoSerifSC-Regular.otf'],
  ['仿宋', 'NotoSerifSC-Regular.otf'],
  ['微软雅黑', 'NotoSansSC-Regular.otf'],
]

function styledFile(regularFile: string, psName: string): string {
  const tokens = norm(psName)
  const bold = /bold|semibold|demi|black|heavy/.test(tokens)
  const italic = /italic|oblique/.test(tokens)
  if (regularFile.startsWith('Liberation')) {
    const base = regularFile.replace(/-Regular\.ttf$/, '')
    if (bold && italic) return `${base}-BoldItalic.ttf`
    if (bold) return `${base}-Bold.ttf`
    if (italic) return `${base}-Italic.ttf`
    return regularFile
  }
  if (regularFile === 'NotoSansSC-Regular.otf' && bold) return 'NotoSansSC-Bold.otf'
  if (regularFile === 'NotoSerifSC-Regular.otf' && bold) return 'NotoSerifSC-Bold.otf'
  if (regularFile === 'NotoSans-Regular.ttf' && bold) return 'NotoSans-Bold.ttf'
  if (regularFile === 'NotoSerif-Regular.ttf') {
    if (bold && italic) return 'NotoSerif-BoldItalic.ttf'
    if (bold) return 'NotoSerif-Bold.ttf'
    if (italic) return 'NotoSerif-Italic.ttf'
  }
  return regularFile
}

function matchesAlias(key: string, alias: string): boolean {
  if (key === alias) return true
  if (!key.startsWith(alias)) return false
  const rest = key.slice(alias.length)
  return /^(bolditalic|bold|italic|oblique|regular|medium|light|mt|ps)*$/.test(rest)
}

function aliasFile(raw: string): string | undefined {
  const key = norm(raw)
  if (!key) return undefined
  for (const [alias, file] of FONT_ALIASES) {
    if (matchesAlias(key, alias)) return file
  }
  return undefined
}

/** Bundled face matching a PDF font name (SimSun → Noto SC, Arial → Liberation, …). */
export function findAliasedBundledFont(psName: string, family: string): Buffer | null {
  const file = aliasFile(psName) ?? aliasFile(family)
  if (!file) return null
  const styled = styledFile(file, `${psName} ${family}`)
  return loadBundledFont(styled) ?? loadBundledFont(file)
}

/** Last-resort bundled face that can draw `text`. Serif keeps Times/宋体 from collapsing to 黑体. */
export function pickBundledFallback(
  text: string,
  kind: 'sans' | 'serif' | 'mono' = 'sans',
): Buffer | null {
  const order: string[] = []
  if (kind === 'mono') {
    order.push('LiberationMono-Regular.ttf', 'NotoSans-Regular.ttf')
  } else if (kind === 'serif') {
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(text)) order.push('NotoSerifJP-Regular.otf')
    if (/[\u3400-\u9fff]/.test(text)) {
      order.push('NotoSerifSC-Regular.otf', 'NotoSerifTC-Regular.otf', 'NotoSerifJP-Regular.otf')
    }
    order.push('LiberationSerif-Regular.ttf', 'NotoSerif-Regular.ttf', 'NotoSerifSC-Regular.otf')
  } else {
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(text)) order.push('NotoSansJP-Regular.otf')
    if (/[\uac00-\ud7af]/.test(text)) order.push('NotoSansKR-Regular.otf')
    if (/[\u3400-\u9fff]/.test(text)) {
      order.push('NotoSansSC-Regular.otf', 'NotoSansTC-Regular.otf')
    }
    order.push('NotoSans-Regular.ttf', 'LiberationSans-Regular.ttf', 'NotoSansSC-Regular.otf')
  }
  const seen = new Set<string>()
  for (const name of order) {
    if (seen.has(name)) continue
    seen.add(name)
    const bytes = loadBundledFont(name)
    if (bytes) return bytes
  }
  return null
}
