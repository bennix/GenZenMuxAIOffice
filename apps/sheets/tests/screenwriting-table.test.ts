import { describe, expect, it } from 'vitest'
import { parseScreenwritingTable } from '../src/renderer/screenwriting-table'

describe('screenwriting tables', () => {
  it('preserves Chinese text and formula-like dialogue as literal strings', () => {
    expect(parseScreenwritingTable('人物\t对白\r\n林夕\t=1+1')).toEqual([
      ['人物', '对白'],
      ['林夕', '=1+1'],
    ])
  })
  it('rejects prose, broken columns and overlong cells before creating a sheet', () => {
    expect(() => parseScreenwritingTable('普通正文')).toThrow('表格')
    expect(() => parseScreenwritingTable('人物\t对白\n只有一列')).toThrow('列数')
    expect(() => parseScreenwritingTable('人物\t对白\n角色\t' + '文'.repeat(32768))).toThrow('长度')
  })
})
