import { expect, it } from 'vitest'
import { ToolRegistry } from './registry'
import { registerProjectTools } from './project-tools'

it('rejects path-like project IDs before accessing storage and validates bounded reads', async () => {
  const called: unknown[] = []
  const registry = new ToolRegistry()
  registerProjectTools(registry, {
    list: () => [],
    chats: () => [],
    chat: () => [],
    create: (name) => {
      called.push(name)
      return { name }
    },
    rename: () => {},
    files: (id) => {
      called.push(id)
      return []
    },
    moveFile: () => {},
    timeline: (id, limit) => {
      called.push({ id, limit })
      return []
    },
  })
  const context = { signal: new AbortController().signal }
  for (const id of ['../outside', '/tmp/project', 'proj-../../x']) {
    expect((await registry.call('projects_files', { id }, context)).isError).toBe(true)
  }
  expect((await registry.call('projects_create', { name: '   ' }, context)).isError).toBe(true)
  expect(
    (await registry.call('projects_timeline', { id: 'default', limit: 10000 }, context)).isError,
  ).toBe(true)
  expect(called).toEqual([])
  expect((await registry.call('projects_timeline', { id: 'default' }, context)).isError).not.toBe(
    true,
  )
  expect(called).toEqual([{ id: 'default', limit: 20 }])
})
