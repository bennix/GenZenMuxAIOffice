import { expect, it } from 'vitest'
import { buildHierarchy } from './hierarchy'

it('resolves unordered rows and sums leaf values', () => {
  expect(
    buildHierarchy([
      { id: 'b', parent: 'a', name: '乙', value: 3 },
      { id: 'a', parent: null, name: '总计' },
      { id: 'c', parent: 'a', name: '丙', value: 7 },
    ])[0],
  ).toMatchObject({ id: 'a', value: 10, children: [{ value: 3 }, { value: 7 }] })
})
it('rejects unreachable cycles, missing parents, duplicate IDs and contradictory totals', () => {
  expect(() =>
    buildHierarchy([
      { id: 'a', parent: 'b', name: 'a' },
      { id: 'b', parent: 'a', name: 'b' },
    ]),
  ).toThrow('循环')
  expect(() => buildHierarchy([{ id: 'a', parent: 'b', name: 'a' }])).toThrow('不存在')
  expect(() =>
    buildHierarchy([
      { id: 'a', parent: null, name: 'a' },
      { id: 'a', parent: null, name: 'a' },
    ]),
  ).toThrow('唯一')
  expect(() =>
    buildHierarchy([
      { id: 'a', parent: null, name: 'a', value: 1 },
      { id: 'b', parent: 'a', name: 'b', value: 2 },
    ]),
  ).toThrow('合计')
})
