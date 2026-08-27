import { beforeAll, describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { EDITORIAL_DIAGRAM_TYPES } from '../src/renderer/diagram-design'
import { cleanMermaidSource } from '../src/renderer/mermaid-ai'
import {
  DEFAULT_PRETTY_THEME,
  PRETTY_MERMAID_TYPES,
  readPrettyTheme,
  sourceForMermaidRender,
  writePrettyTheme,
} from '../src/renderer/mermaid-themes'

describe('Mermaid AI response cleanup', () => {
  it('removes a Mermaid Markdown fence while preserving multiline source', () => {
    expect(cleanMermaidSource('```mermaid\nflowchart TD\n  A --> B\n```')).toBe(
      'flowchart TD\n  A --> B',
    )
  })

  it('does not alter plain Mermaid source', () => {
    expect(cleanMermaidSource('sequenceDiagram\n  Alice->>Bob: 你好')).toBe(
      'sequenceDiagram\n  Alice->>Bob: 你好',
    )
  })
})

describe('Pretty Mermaid theme comments', () => {
  it('writes, reads, and injects themeVariables for rendering', () => {
    const source = writePrettyTheme('flowchart TD\n  A --> B', 'tokyo-night')
    expect(readPrettyTheme(source)).toBe('tokyo-night')
    const rendered = sourceForMermaidRender(source)
    expect(rendered).toContain('%%{init:')
    expect(rendered).toContain('pretty-theme: tokyo-night')
    expect(rendered).toContain('#1a1b26')
  })

  it('falls back to the default theme', () => {
    expect(readPrettyTheme('flowchart TD')).toBe(DEFAULT_PRETTY_THEME)
  })
})

describe('diagram starter sources parse with mermaid', () => {
  beforeAll(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
    })
  })

  it.each(PRETTY_MERMAID_TYPES.map((item) => [item.id, item.source]))(
    'pretty type %s',
    async (_id, source) => {
      await expect(
        mermaid.parse(sourceForMermaidRender(writePrettyTheme(source, 'zinc-light'))),
      ).resolves.toBeTruthy()
    },
  )

  it.each(EDITORIAL_DIAGRAM_TYPES.map((item) => [item.id, item.source]))(
    'editorial type %s',
    async (_id, source) => {
      await expect(
        mermaid.parse(sourceForMermaidRender(writePrettyTheme(source, 'editorial'))),
      ).resolves.toBeTruthy()
    },
  )
})
