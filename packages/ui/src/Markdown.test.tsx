import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'
import { stripNestedMathDelimiters } from './latex'

describe('Markdown', () => {
  it('renders a GFM table as semantic table markup', () => {
    const html = renderToStaticMarkup(
      <Markdown text={'| 页码 | 内容 |\n| :--- | ---: |\n| 1 | **封面** |\n| 2 | 痛点 |'} />,
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<th style="text-align:left">页码</th>')
    expect(html).toContain('<th style="text-align:right">内容</th>')
    expect(html).toContain('<strong>封面</strong>')
    expect(html).not.toContain('| :--- | ---: |')
  })

  it('keeps incomplete streaming table syntax as plain text', () => {
    const html = renderToStaticMarkup(<Markdown text={'| 页码 | 内容 |\n| ---'} />)
    expect(html).not.toContain('<table>')
    expect(html).toContain('| 页码 | 内容 |')
  })

  it('supports escaped pipes inside table cells', () => {
    const html = renderToStaticMarkup(<Markdown text={'| A | B |\n| --- | --- |\n| x\\|y | z |'} />)
    expect(html).toContain('<td>x|y</td>')
  })

  it('preserves and renders LaTeX commands inside table cells', () => {
    const html = renderToStaticMarkup(
      <Markdown text={'| 变量 | 数值 |\n| --- | --- |\n| $F\\_1$ | $\\frac{\\pi}{2}$ |'} />,
    )
    expect(html.match(/class="katex"/g)?.length).toBe(2)
    expect(html).toContain('class="mfrac"')
    expect(html).toContain('F</mi><mn>1</mn>')
  })

  it('renders inline LaTeX throughout prose and list items', () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          '正切函数 $y = \\tan x$ 有间断点。\n\n- 当 $x = \\frac{\\pi}{2}$ 时趋向 $+\\infty$。\n- 区间为 $\\left(-\\frac{\\pi}{2}, \\frac{\\pi}{2}\\right)$。'
        }
      />,
    )
    expect(html.match(/class="katex"/g)?.length).toBe(4)
    expect(html).toContain('class="mfrac"')
    expect(html).toContain('class="mord mathnormal">x</span>')
  })

  it('renders multiline display LaTeX and bracket delimiters', () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          '推导如下：\n\n$$\n\\begin{aligned}\ny &= ax+b \\\\\nx &= \\frac{-b}{a}\n\\end{aligned}\n$$\n\n\\[E = mc^2\\]'
        }
      />,
    )
    expect(html.match(/class="katex-display"/g)?.length).toBe(2)
    expect(html).toContain('class="mtable"')
  })

  it('renders LaTeX nested inside bold text', () => {
    const html = renderToStaticMarkup(<Markdown text={'**公式 $F_1 = G \\sin\\theta$ 很重要**'} />)
    expect(html).toContain('<strong>')
    expect(html).toContain('class="katex"')
  })

  it('renders parenthesized inline LaTeX commands in prose and list items', () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={String.raw`- 水平向右：\(F\cos 37^\circ = 60\times 0.8 = 48\,\mathrm{N}\)
- 气体摩尔体积 \(V_\mathrm{m}\)：\(n = V/V_\mathrm{m}\)

1 mol C 和 1 mol \(\mathrm{O_2}\) 恰好生成 1 mol \(\mathrm{CO_2}\)。`}
      />,
    )
    expect(html.match(/class="katex"/g)?.length).toBe(5)
    expect(html).not.toContain(String.raw`\(F\cos`)
    expect(html).not.toContain(String.raw`\(\mathrm{O_2}\)`)
  })

  it('renders mhchem expressions returned by AI', () => {
    const html = renderToStaticMarkup(
      <Markdown text={String.raw`燃烧反应：\(\ce{2H2 + O2 -> 2H2O}\)`} />,
    )
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('katex-error')
    expect(html).not.toContain(String.raw`\(\ce{2H2 + O2 -> 2H2O}\)`)
  })

  it('repairs redundant dollar delimiters inside display math returned by AI', () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={String.raw`$$
$F_1 = 5\mathrm{N}$ < $f_{\max} = 8\mathrm{N}$
\boxed{f_1 = $F_1 = 5\mathrm{N}$}
$$`}
      />,
    )
    expect(html.match(/class="katex-display"/g)?.length).toBe(1)
    expect(html).toContain('<menclose notation="box">')
    expect(html).not.toContain('class="mord">$</span>')
  })

  it('removes only unescaped nested math delimiters', () => {
    expect(stripNestedMathDelimiters(String.raw`$F_1$ + \$5`)).toBe(String.raw`F_1 + \$5`)
  })

  it('keeps an incomplete streaming delimiter visible until it closes', () => {
    const html = renderToStaticMarkup(<Markdown text={'正在生成 $x = \\frac{1}{2'} />)
    expect(html).toContain('$x = \\frac{1}{2')
    expect(html).not.toContain('class="katex"')
  })

  it('repairs review Markdown with bare LaTeX and malformed strong spacing', () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={String.raw`## 2. Strengths

- **问题具有现实意义。 **将“一类一个模型”改为单模型多类别跟踪。

第 3.2 节将关键点坐标定义为 (R_{t-1}\in\mathbb{R}^{N_q\times3})，上一帧为 (R_{t-1})，但式（13）写为

$$
R_t^{gt}=T_\theta R_{t-1}+t_{gt},
$$

其中 (T_\theta\in\mathbb{R}^{3\times3})。`}
      />,
    )
    expect(html).toContain('<strong>问题具有现实意义。</strong> 将')
    expect(html.match(/class="katex"/g)?.length).toBe(4)
    expect(html).toContain('class="katex-display"')
    expect(html).not.toContain('**')
    expect(html).not.toContain('$$')
  })

  it('does not normalize Markdown or bare LaTeX inside code', () => {
    const markdown =
      '行内：`**raw** (R\\in\\mathbb{R})`\n\n' + '```md\n**raw ** (R\\in\\mathbb{R})\n```'
    const html = renderToStaticMarkup(<Markdown text={markdown} />)
    expect(html).toContain('<code>**raw** (R\\in\\mathbb{R})</code>')
    expect(html).toContain('**raw ** (R\\in\\mathbb{R})')
  })

  it('repairs escaped and zero-width Markdown delimiters returned by AI', () => {
    const html = renderToStaticMarkup(
      <Markdown text={'- \\*\\*第一项 \\*\\*正文\n- **第\u200B二项**正文'} />,
    )
    expect(html).toContain('<strong>第一项</strong> 正文')
    expect(html).toContain('<strong>第二项</strong>正文')
    expect(html).not.toContain('\\*')
    expect(html).not.toContain('\u200B')
  })
})
