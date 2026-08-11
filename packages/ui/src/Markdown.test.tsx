import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

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
})
