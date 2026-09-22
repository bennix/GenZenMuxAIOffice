import { expect, it } from 'vitest'
import { buildFlow } from './network'

it('aggregates duplicate links without changing node identity', () => {
  const result = buildFlow([
    { source: 'A', target: 'B', value: 2 },
    { source: 'A', target: 'B', value: 3 },
  ])
  expect(result.links).toEqual([{ source: 'A', target: 'B', value: 5 }])
  expect(result.nodes).toEqual([{ name: 'A' }, { name: 'B' }])
})
it('rejects cycles for Sankey but accepts them for general graphs', () => {
  const edges = [
    { source: 'A', target: 'B', value: 2 },
    { source: 'B', target: 'A', value: 1 },
  ]
  expect(() => buildFlow(edges)).toThrow('循环')
  expect(buildFlow(edges, false).links).toHaveLength(2)
  expect(() => buildFlow([{ source: 'A', target: 'B', value: -1 }])).toThrow('非负')
})
