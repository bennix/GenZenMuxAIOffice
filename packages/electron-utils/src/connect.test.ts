import { describe, expect, it } from 'vitest'
import { markdownTableOrLines, removeConnectCommand } from './connect'

describe('removeConnectCommand', () => {
  it('recognises a standalone command case-insensitively', () => {
    expect(removeConnectCommand('@Connect')).toEqual({ text: '', matched: true })
    expect(removeConnectCommand('hello @connect world')).toEqual({
      text: 'hello world',
      matched: true,
    })
  })

  it('does not match an email-like or longer token', () => {
    expect(removeConnectCommand('name@ConnectX')).toEqual({
      text: 'name@ConnectX',
      matched: false,
    })
  })
})

describe('markdownTableOrLines', () => {
  it('turns a Markdown table into cells', () => {
    expect(markdownTableOrLines('| 名称 | 数量 |\n|---|---:|\n| 苹果 | 2 |')).toEqual([
      ['名称', '数量'],
      ['苹果', '2'],
    ])
  })

  it('places ordinary lines in one column', () => {
    expect(markdownTableOrLines('第一行\n第二行')).toEqual([['第一行'], ['第二行']])
  })
})
