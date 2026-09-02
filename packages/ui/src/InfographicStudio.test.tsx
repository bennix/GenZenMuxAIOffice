import { describe, expect, it } from 'vitest'
import { renderToString } from '@antv/infographic/ssr'

import { cleanInfographicSyntax, infographicSyntaxFromRows } from './InfographicStudio'

describe('infographic studio data bridge', () => {
  it('turns a spreadsheet selection into valid, compact AntV syntax', () => {
    const syntax = infographicSyntaxFromRows([
      ['地区', '收入', '增长率'],
      ['华东', 1280, '12%'],
      ['华南', 960, '8%'],
    ])
    expect(syntax).toContain('infographic list-grid-badge-card')
    expect(syntax).toContain('label 华东')
    expect(syntax).toContain('收入: 1280 · 增长率: 12%')
    expect(syntax).not.toContain('\n+')
  })

  it('accepts ZenMux output with or without a fenced wrapper', () => {
    expect(
      cleanInfographicSyntax('```infographic\ninfographic compare-swot\ntheme light\n```'),
    ).toBe('infographic compare-swot\ntheme light')
    expect(cleanInfographicSyntax('源码: infographic chart-column-simple')).toBe(
      'infographic chart-column-simple',
    )
  })

  it('renders locally without a remote font stylesheet', async () => {
    const syntax = infographicSyntaxFromRows([
      ['地区', '收入'],
      ['华东', 1280],
    ])
    const svg = await renderToString(syntax)
    expect(svg).toContain('<svg')
    expect(svg).not.toContain('https://assets.antv')
  })
})
