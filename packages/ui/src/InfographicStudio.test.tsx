import { describe, expect, it } from 'vitest'
import { renderToString } from '@antv/infographic/ssr'

import {
  cleanInfographicSyntax,
  decodeInfographicMetadata,
  encodeInfographicMetadata,
  infographicSyntaxFromRows,
} from './InfographicStudio'

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

  it('round-trips Unicode editable source through OOXML-safe metadata', () => {
    const syntax = `infographic sequence-timeline-simple\ntheme light\ndata\n  title 科研路线 α→β\n  desc 保留中文、公式与 100% 数据`
    const metadata = encodeInfographicMetadata(syntax)
    expect(metadata).toMatch(/^zenoffice-infographic:/)
    expect(metadata).not.toContain('科研路线')
    expect(decodeInfographicMetadata(metadata)).toBe(syntax)
    expect(decodeInfographicMetadata('ordinary picture')).toBeNull()
    expect(decodeInfographicMetadata('zenoffice-infographic:%E0%A4%A')).toBeNull()
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
