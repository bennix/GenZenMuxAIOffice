import type { WechatDensityId, WechatTheme } from './themes'
import { WECHAT_DENSITIES } from './themes'

function px(value: number): string {
  return `${Math.round(value * 10) / 10}px`
}

function style(map: Record<string, string | undefined>): string {
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

function scaleOf(density: WechatDensityId) {
  return WECHAT_DENSITIES.find((item) => item.id === density) ?? WECHAT_DENSITIES[1]
}

/** Strip editor chrome, then stamp inline styles so WeChat keeps the typesetting. */
export function buildWechatHtml(
  editorRoot: HTMLElement,
  theme: WechatTheme,
  density: WechatDensityId,
): string {
  const scale = scaleOf(density)
  const clone = editorRoot.cloneNode(true) as HTMLElement
  clone.removeAttribute('contenteditable')
  for (const el of clone.querySelectorAll('[contenteditable]'))
    el.removeAttribute('contenteditable')
  for (const bar of clone.querySelectorAll('.md-codeblock-bar, .md-mermaid-inline-ai')) bar.remove()
  for (const pre of clone.querySelectorAll('.md-mermaid-block pre')) (pre as HTMLElement).remove()

  const fontSize = 16 * scale.font
  const lineHeight = 1.75 * scale.line
  const pMargin = 16 * scale.margin

  apply(clone, 'p', {
    margin: `${px(pMargin)} 0`,
    'line-height': String(lineHeight),
    color: theme.color,
    'font-size': px(fontSize),
  })
  for (let level = 1; level <= 6; level++) {
    const size = [28, 24, 21, 19, 17, 16][level - 1]! * scale.font
    apply(clone, `h${level}`, {
      'font-family': theme.headingFont,
      'font-weight': '700',
      color: theme.headingColor,
      'font-size': px(size),
      'line-height': '1.35',
      'margin-top': px(28 * scale.margin),
      'margin-bottom': px(12 * scale.margin),
      'letter-spacing': '0.4px',
    })
  }
  apply(clone, 'blockquote', {
    background: theme.quoteBg,
    color: theme.quoteColor,
    'border-left': `4px solid ${theme.quoteBorder}`,
    'border-radius': '0 6px 6px 0',
    padding: '12px 16px',
    margin: `${px(20 * scale.margin)} 0`,
  })
  apply(clone, 'a', { color: theme.linkColor, 'text-decoration': 'underline' })
  apply(clone, 'hr', {
    border: 'none',
    'border-top': `1px solid ${theme.hrColor}`,
    margin: `${px(28 * scale.margin)} 0`,
  })
  apply(clone, 'ul,ol', {
    'padding-left': '26px',
    margin: `${px(12 * scale.margin)} 0`,
    color: theme.color,
  })
  apply(clone, 'li', { margin: `${px(6 * scale.margin)} 0` })
  apply(clone, 'code', {
    background: theme.codeBg,
    color: theme.codeColor,
    'border-radius': '4px',
    padding: '2px 5px',
    'font-family': theme.mono,
    'font-size': '0.9em',
  })
  apply(clone, 'pre', {
    background: theme.codeBlockBg,
    color: theme.codeColor,
    'border-radius': '6px',
    padding: '14px 16px',
    margin: `${px(16 * scale.margin)} 0`,
    'font-family': theme.mono,
    'font-size': px(14 * scale.font),
    'line-height': '1.6',
    'white-space': 'pre-wrap',
    overflow: 'auto',
  })
  apply(clone, 'pre code', { background: 'transparent', padding: '0' })
  apply(clone, 'table', {
    'border-collapse': 'collapse',
    width: '100%',
    margin: `${px(16 * scale.margin)} 0`,
    'font-size': px(15 * scale.font),
  })
  apply(clone, 'th,td', {
    border: `1px solid ${theme.tableBorder}`,
    padding: '8px 12px',
    color: theme.color,
  })
  apply(clone, 'th', { background: theme.tableHeadBg, 'font-weight': '600' })
  apply(clone, 'img,svg', {
    'max-width': '100%',
    height: 'auto',
    display: 'block',
    margin: `${px(16 * scale.margin)} auto`,
  })
  apply(clone, 'strong', { 'font-weight': '700', color: theme.headingColor })
  apply(clone, 'em', { 'font-style': 'italic' })
  apply(clone, 'mark', { background: theme.markBg, 'border-radius': '3px', padding: '1px 4px' })

  const sectionStyle = style({
    'font-family': theme.bodyFont,
    'font-size': px(fontSize),
    'line-height': String(lineHeight),
    color: theme.color,
    background: theme.bg,
    padding: '24px 20px',
    'max-width': '677px',
    margin: '0 auto',
    'word-break': 'break-word',
  })
  return `<section style="${sectionStyle}">${clone.innerHTML}</section>`
}

function apply(root: HTMLElement, selector: string, map: Record<string, string>): void {
  const css = style(map)
  for (const el of root.querySelectorAll(selector)) {
    const node = el as HTMLElement
    const current = node.getAttribute('style')
    node.setAttribute('style', current ? `${current};${css}` : css)
  }
}
