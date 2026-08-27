import { describe, expect, it } from 'vitest'
import { buildWechatHtml } from '../src/renderer/wechat/export'
import { WECHAT_THEMES } from '../src/renderer/wechat/themes'

describe('WeChat MP inline export', () => {
  it('stamps inline styles and keeps the body copy', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h1>标题</h1><p>正文 <strong>强调</strong></p><blockquote>引用</blockquote>'
    const html = buildWechatHtml(root, WECHAT_THEMES[0]!, 'standard')
    expect(html.startsWith('<section style=')).toBe(true)
    expect(html).toContain('标题')
    expect(html).toContain('正文')
    expect(html).toContain('style=')
    expect(html).not.toContain('class=')
    expect(html).toMatch(/font-size:28px/)
    expect(html).toMatch(/border-left:4px solid/)
  })

  it('drops editor chrome from mermaid blocks', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="md-mermaid-block"><div class="md-codeblock-bar">bar</div><div class="md-mermaid-preview"><svg></svg></div><pre>flowchart TD</pre></div>'
    const html = buildWechatHtml(root, WECHAT_THEMES[0]!, 'compact')
    expect(html).not.toContain('md-codeblock-bar')
    expect(html).not.toContain('flowchart TD')
    expect(html).toContain('<svg')
  })
})
