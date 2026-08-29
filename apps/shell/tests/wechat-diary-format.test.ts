import { describe, expect, it } from 'vitest'
import { classifyWechatText } from '../src/main/wechat-diary/commands'
import {
  appendDiaryEntry,
  appendSeal,
  createDiaryDocument,
  withdrawLastTurn,
} from '../src/main/wechat-diary/format'

describe('diary markdown', () => {
  it('creates a 3-day frontmatter document', () => {
    const doc = createDiaryDocument('2026-08-27', '2026-08-29')
    expect(doc).toContain('window: 2026-08-27/2026-08-29')
    expect(doc).toContain('# 2026-08-27 ~ 2026-08-29')
  })

  it('appends wechat then AI and withdraws the pair', () => {
    let doc = createDiaryDocument('2026-08-27', '2026-08-29')
    doc = appendDiaryEntry(doc, '23:05', 'wechat', '今天试了新豆子')
    doc = appendDiaryEntry(doc, '23:06', 'ai', '花香很明显。')
    expect(doc).toContain('**23:05 · 微信**')
    expect(doc).toContain('**23:06 · AI**')
    const withdrawn = withdrawLastTurn(doc)
    expect(withdrawn.removed).toBe(true)
    expect(withdrawn.next).not.toContain('今天试了新豆子')
    expect(withdrawn.next).not.toContain('花香很明显')
    expect(withdrawn.next).toContain('window: 2026-08-27/2026-08-29')
  })

  it('appends a seal footnote', () => {
    const doc = appendSeal(createDiaryDocument('2026-08-27', '2026-08-29'), '23:02')
    expect(doc).toContain('_(本窗口封存于 23:02)_')
  })
})

describe('wechat commands', () => {
  it('classifies help / ping / withdraw / seal / note / chat', () => {
    expect(classifyWechatText('帮助').kind).toBe('help')
    expect(classifyWechatText('在吗').kind).toBe('ping')
    expect(classifyWechatText('撤回').kind).toBe('withdraw')
    expect(classifyWechatText('如何撤回提交').kind).toBe('chat')
    expect(classifyWechatText('好，结束').kind).toBe('seal')
    expect(classifyWechatText('晚安🌙').kind).toBe('seal')
    expect(classifyWechatText('记：买牛奶')).toEqual({ kind: 'note', text: '买牛奶' })
    expect(classifyWechatText('今天天气如何').kind).toBe('chat')
  })
})
