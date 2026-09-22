import { expect, it, vi } from 'vitest'
import { ToolRegistry } from './registry'
import { registerWordTools } from './word-tools'

it('requires a Word revision, limits input and rejects XML control characters before dispatch', async () => {
  const registry = new ToolRegistry(),
    handler = vi.fn().mockResolvedValue({ dirty: true })
  registerWordTools(registry, handler)
  const context = { signal: new AbortController().signal }
  const base = {
    id: 'word',
    text: '正文',
    expectedRevision: '77b8c0c2-0219-4d69-82e0-3a71f47bfb9e',
  }
  expect(
    (await registry.call('word_insert_text', { id: 'word', text: '缺少版本' }, context)).isError,
  ).toBe(true)
  expect(
    (await registry.call('word_insert_text', { ...base, text: '\u0000' }, context)).isError,
  ).toBe(true)
  expect((await registry.call('word_read_text', { id: 'word', offset: -1 }, context)).isError).toBe(
    true,
  )
  expect(handler).not.toHaveBeenCalled()
  expect((await registry.call('word_insert_text', base, context)).isError).toBeUndefined()
  expect(handler).toHaveBeenCalledWith('word', {
    action: 'insert',
    text: '正文',
    position: 'end',
    expectedRevision: base.expectedRevision,
  })
})
