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
})
