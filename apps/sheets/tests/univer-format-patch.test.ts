import { describe, expect, it, vi } from 'vitest'

import { applyFormatPatchToRange } from '../src/renderer/univer-sync'

function rangeHarness() {
  return {
    setFontWeight: vi.fn(),
    setFontStyle: vi.fn(),
    setFontLine: vi.fn(),
    setValue: vi.fn(),
    setFontFamily: vi.fn(),
    setFontSize: vi.fn(),
    setFontColor: vi.fn(),
    setBackground: vi.fn(),
    setNumberFormat: vi.fn(),
    setHorizontalAlignment: vi.fn(),
    setVerticalAlignment: vi.fn(),
    setWrap: vi.fn(),
  }
}

describe('applyFormatPatchToRange horizontal alignment', () => {
  it.each([
    ['left', 'left'],
    ['center', 'center'],
    ['right', 'normal'],
    [null, 'normal'],
  ] as const)('maps neutral %s to Univer %s', (input, expected) => {
    const range = rangeHarness()
    applyFormatPatchToRange(range as never, { horizontalAlign: input })
    expect(range.setHorizontalAlignment).toHaveBeenCalledWith(expected)
  })

  it('applies right alignment together with the rest of an AI format patch', () => {
    const range = rangeHarness()
    applyFormatPatchToRange(range as never, {
      horizontalAlign: 'right',
      bold: true,
      numberFormat: '#,##0',
    })
    expect(range.setHorizontalAlignment).toHaveBeenCalledWith('normal')
    expect(range.setFontWeight).toHaveBeenCalledWith('bold')
    expect(range.setNumberFormat).toHaveBeenCalledWith('#,##0')
  })
})
