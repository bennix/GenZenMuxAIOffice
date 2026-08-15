import { describe, expect, it } from 'vitest'
import { pasteWatermarkText } from '../src/renderer/watermark-text'

describe('watermark clipboard paste', () => {
  it('inserts text at the current selection', () => {
    expect(pasteWatermarkText('机密样本', '内部', 2, 4)).toEqual({
      text: '机密内部',
      caret: 4,
    })
  })

  it('folds multiline clipboard content into a single-line watermark', () => {
    expect(pasteWatermarkText('DRAFT', 'CONFIDENTIAL\n内部', 0, 5)).toEqual({
      text: 'CONFIDENTIAL 内部',
      caret: 15,
    })
  })
})
