/** Pretty Mermaid (imxv/Pretty-mermaid-skills) palettes, mapped onto mermaid.js themeVariables. */

export interface PrettyMermaidTheme {
  id: string
  label: string
  group: 'light' | 'dark' | 'other'
  bg: string
  fg: string
  accent: string
  surface: string
  line: string
  muted: string
}

export const PRETTY_MERMAID_THEMES: readonly PrettyMermaidTheme[] = [
  {
    id: 'zinc-light',
    label: 'Zinc Light',
    group: 'light',
    bg: '#ffffff',
    fg: '#27272a',
    accent: '#52525b',
    surface: '#f4f4f5',
    line: '#a1a1aa',
    muted: '#71717a',
  },
  {
    id: 'tokyo-night-light',
    label: 'Tokyo Night Light',
    group: 'light',
    bg: '#d5d6db',
    fg: '#34548a',
    accent: '#34548a',
    surface: '#e6e7ed',
    line: '#8f93a3',
    muted: '#5a6078',
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    group: 'light',
    bg: '#eff1f5',
    fg: '#4c4f69',
    accent: '#8839ef',
    surface: '#e6e9ef',
    line: '#9ca0b0',
    muted: '#6c6f85',
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    group: 'light',
    bg: '#ffffff',
    fg: '#1f2328',
    accent: '#0969da',
    surface: '#f6f8fa',
    line: '#d0d7de',
    muted: '#656d76',
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    group: 'light',
    bg: '#fdf6e3',
    fg: '#657b83',
    accent: '#268bd2',
    surface: '#eee8d5',
    line: '#93a1a1',
    muted: '#839496',
  },
  {
    id: 'nord-light',
    label: 'Nord Light',
    group: 'light',
    bg: '#eceff4',
    fg: '#3b4252',
    accent: '#5e81ac',
    surface: '#e5e9f0',
    line: '#d8dee9',
    muted: '#4c566a',
  },
  {
    id: 'zinc-dark',
    label: 'Zinc Dark',
    group: 'dark',
    bg: '#18181b',
    fg: '#fafafa',
    accent: '#a1a1aa',
    surface: '#27272a',
    line: '#3f3f46',
    muted: '#a1a1aa',
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    group: 'dark',
    bg: '#1a1b26',
    fg: '#a9b1d6',
    accent: '#7aa2f7',
    surface: '#24283b',
    line: '#3d59a1',
    muted: '#565f89',
  },
  {
    id: 'tokyo-night-storm',
    label: 'Tokyo Night Storm',
    group: 'dark',
    bg: '#24283b',
    fg: '#a9b1d6',
    accent: '#7aa2f7',
    surface: '#1a1b26',
    line: '#3d59a1',
    muted: '#565f89',
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    group: 'dark',
    bg: '#1e1e2e',
    fg: '#cdd6f4',
    accent: '#cba6f7',
    surface: '#313244',
    line: '#45475a',
    muted: '#a6adc8',
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    group: 'dark',
    bg: '#0d1117',
    fg: '#e6edf3',
    accent: '#4493f8',
    surface: '#161b22',
    line: '#30363d',
    muted: '#8b949e',
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    group: 'dark',
    bg: '#002b36',
    fg: '#93a1a1',
    accent: '#268bd2',
    surface: '#073642',
    line: '#586e75',
    muted: '#839496',
  },
  {
    id: 'nord',
    label: 'Nord',
    group: 'other',
    bg: '#2e3440',
    fg: '#eceff4',
    accent: '#88c0d0',
    surface: '#3b4252',
    line: '#4c566a',
    muted: '#d8dee9',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    group: 'other',
    bg: '#282a36',
    fg: '#f8f8f2',
    accent: '#bd93f9',
    surface: '#44475a',
    line: '#6272a4',
    muted: '#6272a4',
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    group: 'other',
    bg: '#282c34',
    fg: '#abb2bf',
    accent: '#61afef',
    surface: '#21252b',
    line: '#3e4451',
    muted: '#5c6370',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    group: 'light',
    bg: '#f5f5f5',
    fg: '#2d3142',
    accent: '#eb6c36',
    surface: '#ffffff',
    line: '#c0c0c0',
    muted: '#6b7280',
  },
]

export const DEFAULT_PRETTY_THEME = 'zinc-light'
const THEME_COMMENT = /^%%\s*pretty-theme:\s*([a-z0-9-]+)\s*$/im
const INIT_DIRECTIVE = /^%%\{init:[\s\S]*?\}%%\s*/m

export function prettyThemeById(id: string): PrettyMermaidTheme {
  return PRETTY_MERMAID_THEMES.find((theme) => theme.id === id) ?? PRETTY_MERMAID_THEMES[0]!
}

export function readPrettyTheme(source: string): string {
  const match = source.match(THEME_COMMENT)
  return match?.[1] && PRETTY_MERMAID_THEMES.some((theme) => theme.id === match[1])
    ? match[1]
    : DEFAULT_PRETTY_THEME
}

export function writePrettyTheme(source: string, themeId: string): string {
  const id = prettyThemeById(themeId).id
  const body = source.replace(THEME_COMMENT, '').replace(INIT_DIRECTIVE, '').replace(/^\n+/, '')
  return `%% pretty-theme: ${id}\n${body}`
}

export function mermaidThemeVariables(theme: PrettyMermaidTheme): Record<string, string | boolean> {
  return {
    darkMode: theme.group === 'dark',
    background: theme.bg,
    mainBkg: theme.surface,
    primaryColor: theme.surface,
    primaryTextColor: theme.fg,
    primaryBorderColor: theme.accent,
    secondaryColor: theme.bg,
    tertiaryColor: theme.surface,
    lineColor: theme.line,
    textColor: theme.fg,
    nodeTextColor: theme.fg,
    clusterBkg: theme.bg,
    clusterBorder: theme.line,
    titleColor: theme.fg,
    edgeLabelBackground: theme.bg,
    actorBkg: theme.surface,
    actorBorder: theme.accent,
    actorTextColor: theme.fg,
    signalColor: theme.accent,
    labelBoxBkgColor: theme.surface,
    labelTextColor: theme.fg,
    noteBkgColor: theme.surface,
    noteTextColor: theme.fg,
    noteBorderColor: theme.line,
  }
}

/** Source actually handed to mermaid.render: inject themeVariables, keep the comment for round-trips. */
export function sourceForMermaidRender(source: string): string {
  const theme = prettyThemeById(readPrettyTheme(source))
  const body = source.replace(INIT_DIRECTIVE, '').trim()
  const init = JSON.stringify({ theme: 'base', themeVariables: mermaidThemeVariables(theme) })
  return `%%{init: ${init}}%%\n${body}`
}

export const PRETTY_MERMAID_TYPES = [
  {
    id: 'flowchart',
    labelZh: '流程图',
    labelEn: 'Flowchart',
    source: `flowchart LR
  需求 --> 设计
  设计 --> 开发
  开发 --> 测试
  测试 -->|通过| 发布
  测试 -->|失败| 开发`,
  },
  {
    id: 'sequence',
    labelZh: '时序图',
    labelEn: 'Sequence',
    source: `sequenceDiagram
  actor 用户
  participant 客户端
  participant 服务
  用户->>客户端: 提交请求
  客户端->>服务: API 调用
  服务-->>客户端: 结果
  客户端-->>用户: 展示`,
  },
  {
    id: 'state',
    labelZh: '状态图',
    labelEn: 'State',
    source: `stateDiagram-v2
  [*] --> 草稿
  草稿 --> 审阅: 提交
  审阅 --> 草稿: 退回
  审阅 --> 发布: 通过
  发布 --> [*]`,
  },
  {
    id: 'class',
    labelZh: '类图',
    labelEn: 'Class',
    source: `classDiagram
  class 文档 {
    +标题
    +保存()
  }
  class 段落 {
    +文本
  }
  文档 "1" --> "*" 段落`,
  },
  {
    id: 'er',
    labelZh: 'ER 图',
    labelEn: 'ER',
    source: `erDiagram
  项目 ||--o{ 文件 : 包含
  文件 ||--o{ 修订 : 记录
  用户 ||--o{ 项目 : 拥有`,
  },
  {
    id: 'xy',
    labelZh: 'XY 图',
    labelEn: 'XY chart',
    source: `xychart-beta
  title "本周完成量"
  x-axis ["周一", "周二", "周三", "周四", "周五"]
  y-axis "项" 0 --> 20
  bar [4, 8, 12, 9, 15]
  line [4, 8, 12, 9, 15]`,
  },
] as const
