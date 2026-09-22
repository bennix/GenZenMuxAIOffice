import { expect, it, vi } from 'vitest'
import { ToolRegistry } from './registry'
import { registerKnowledgeTools } from './knowledge-tools'

it('validates knowledge arguments before dispatch and advertises destructive mutations', async () => {
  const registry = new ToolRegistry()
  const handler = vi.fn()
  registerKnowledgeTools(registry, {
    list: handler,
    search: handler,
    delete: handler,
    clear: handler,
    getSettings: handler,
    setSettings: handler,
  })
  const context = { signal: new AbortController().signal }
  for (const [name, args] of [
    ['knowledge_search', { query: ' ' }],
    ['knowledge_search', { query: 'revenue', projectId: '../outside' }],
    ['knowledge_list', { limit: 1001 }],
    ['knowledge_set_settings', { maxResults: 0 }],
    ['knowledge_set_settings', { autoCapture: 'yes' }],
    ['knowledge_set_settings', { unknown: true }],
    ['knowledge_delete', { id: '' }],
    ['knowledge_clear', { projectId: 'default' }],
  ] as const)
    expect((await registry.call(name, args, context)).isError).toBe(true)
  expect(handler).not.toHaveBeenCalled()
  await registry.call('knowledge_list', {}, context)
  expect(handler).toHaveBeenCalledWith('', 200)
  expect(
    registry.list().find((tool) => tool.name === 'knowledge_clear')?.annotations.destructiveHint,
  ).toBe(true)
  expect(
    registry.list().find((tool) => tool.name === 'knowledge_search')?.annotations.readOnlyHint,
  ).toBe(true)
})
