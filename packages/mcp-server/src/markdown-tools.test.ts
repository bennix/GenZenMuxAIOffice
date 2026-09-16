import { describe, expect, it, vi } from 'vitest'
import { ToolRegistry } from './registry'
import { registerMarkdownTools } from './markdown-tools'

describe('Markdown tools', () => {
  it('requires conflict checks and rejects unsupported arguments before dispatch', async () => {
    const registry = new ToolRegistry()
    const call = vi.fn().mockResolvedValue({ text: 'new', dirty: true })
    registerMarkdownTools(registry, call)
    const context = { signal: new AbortController().signal }
    expect(
      (await registry.call('markdown_replace', { id: 'md', text: 'new' }, context)).isError,
    ).toBe(true)
    expect(
      (await registry.call('markdown_save', { id: 'md', path: '/tmp/other.md' }, context)).isError,
    ).toBe(true)
    expect(call).not.toHaveBeenCalled()
    expect(
      (
        await registry.call(
          'markdown_replace',
          { id: 'md', text: 'new', expectedText: 'old' },
          context,
        )
      ).isError,
    ).toBeUndefined()
    expect(call).toHaveBeenCalledWith('md', { action: 'replace', text: 'new', expectedText: 'old' })
  })
})
