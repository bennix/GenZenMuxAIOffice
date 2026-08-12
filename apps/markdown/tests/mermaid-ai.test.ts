import { describe, expect, it } from 'vitest'
import { cleanMermaidSource } from '../src/renderer/mermaid-ai'

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
