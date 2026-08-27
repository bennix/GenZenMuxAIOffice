/** WeChat MP themes distilled from whyubel1eve/Mars-Editor (inline styles only). */

export interface WechatTheme {
  id: string
  nameZh: string
  nameEn: string
  appearance: 'light' | 'dark'
  bodyFont: string
  headingFont: string
  mono: string
  bg: string
  color: string
  accent: string
  headingColor: string
  quoteBg: string
  quoteColor: string
  quoteBorder: string
  codeBg: string
  codeColor: string
  codeBlockBg: string
  linkColor: string
  tableBorder: string
  tableHeadBg: string
  hrColor: string
  markBg: string
}

const SANS =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const SERIF = "Georgia, 'Songti SC', 'STSong', serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

export const WECHAT_THEMES: readonly WechatTheme[] = [
  {
    id: 'classic',
    nameZh: '经典',
    nameEn: 'Classic',
    appearance: 'light',
    bodyFont: SANS,
    headingFont: SERIF,
    mono: MONO,
    bg: '#ffffff',
    color: '#2b2b2b',
    accent: '#d97757',
    headingColor: '#1a1a1a',
    quoteBg: '#faf6f2',
    quoteColor: '#4a4a45',
    quoteBorder: '#d97757',
    codeBg: '#f4f1ec',
    codeColor: '#26231e',
    codeBlockBg: '#f7f5f0',
    linkColor: '#d97757',
    tableBorder: '#e5e3dc',
    tableHeadBg: '#f4f1ec',
    hrColor: '#e5e3dc',
    markBg: '#fff3c4',
  },
  {
    id: 'editorial',
    nameZh: '杂志',
    nameEn: 'Editorial',
    appearance: 'light',
    bodyFont: SANS,
    headingFont: SERIF,
    mono: MONO,
    bg: '#fffdf8',
    color: '#22211e',
    accent: '#c43a2d',
    headingColor: '#14120e',
    quoteBg: 'transparent',
    quoteColor: '#6b4a3f',
    quoteBorder: '#c43a2d',
    codeBg: '#f4efe6',
    codeColor: '#26231e',
    codeBlockBg: '#f7f2ea',
    linkColor: '#c43a2d',
    tableBorder: '#e8e0d4',
    tableHeadBg: '#f4efe6',
    hrColor: '#14120e',
    markBg: '#ffe8c8',
  },
  {
    id: 'cream',
    nameZh: '奶油',
    nameEn: 'Cream',
    appearance: 'light',
    bodyFont: SANS,
    headingFont: SANS,
    mono: MONO,
    bg: '#fbf7ef',
    color: '#3a342b',
    accent: '#b45309',
    headingColor: '#292318',
    quoteBg: '#f3ebe0',
    quoteColor: '#5c5348',
    quoteBorder: '#b45309',
    codeBg: '#f0e8d8',
    codeColor: '#292318',
    codeBlockBg: '#f3ebe0',
    linkColor: '#b45309',
    tableBorder: '#e6dccb',
    tableHeadBg: '#f0e8d8',
    hrColor: '#e6dccb',
    markBg: '#ffe8b8',
  },
  {
    id: 'sakura',
    nameZh: '樱花',
    nameEn: 'Sakura',
    appearance: 'light',
    bodyFont: SANS,
    headingFont: SERIF,
    mono: MONO,
    bg: '#fff8f8',
    color: '#3a2f32',
    accent: '#d4537e',
    headingColor: '#2a1f22',
    quoteBg: '#fff0f3',
    quoteColor: '#6b4a55',
    quoteBorder: '#d4537e',
    codeBg: '#fceef2',
    codeColor: '#2a1f22',
    codeBlockBg: '#fff0f3',
    linkColor: '#d4537e',
    tableBorder: '#f3d5dd',
    tableHeadBg: '#fceef2',
    hrColor: '#f3d5dd',
    markBg: '#ffd6e5',
  },
  {
    id: 'dark',
    nameZh: '墨夜',
    nameEn: 'Ink night',
    appearance: 'dark',
    bodyFont: SANS,
    headingFont: SANS,
    mono: MONO,
    bg: '#1c1c1e',
    color: '#e8e6e3',
    accent: '#e8a87c',
    headingColor: '#f4f1ea',
    quoteBg: '#2a2a2e',
    quoteColor: '#cfc8be',
    quoteBorder: '#e8a87c',
    codeBg: '#2a2a2e',
    codeColor: '#f4f1ea',
    codeBlockBg: '#161618',
    linkColor: '#e8a87c',
    tableBorder: '#3a3a40',
    tableHeadBg: '#2a2a2e',
    hrColor: '#3a3a40',
    markBg: '#5a4630',
  },
]

export const WECHAT_DENSITIES = [
  { id: 'compact', nameZh: '紧凑', nameEn: 'Compact', font: 0.92, line: 0.94, margin: 0.78 },
  { id: 'standard', nameZh: '标准', nameEn: 'Standard', font: 1, line: 1, margin: 1 },
  { id: 'roomy', nameZh: '宽松', nameEn: 'Roomy', font: 1.08, line: 1.06, margin: 1.22 },
] as const

export type WechatDensityId = (typeof WECHAT_DENSITIES)[number]['id']
