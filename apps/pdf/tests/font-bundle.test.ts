import { describe, expect, it } from 'vitest'
import { fontCoversText } from '../src/main/font-cmap'
import {
  bundledFontsDir,
  findNimbusRomanFont,
  findAliasedBundledFont,
  loadBundledFont,
  pickBundledFallback,
} from '../src/main/font-bundle'
import { listEditFonts } from '../src/main/text-edit'

describe('bundled edit fonts', () => {
  it('ships the same Nimbus Roman family for all legacy face names', () => {
    for (const [legacy, style] of [
      ['NimbusRomNo9L-Regu', 'Regular'],
      ['NimbusRomNo9L-Medi', 'Bold'],
      ['NimbusRomNo9L-ReguItal', 'Italic'],
      ['NimbusRomNo9L-MediItal', 'BoldItalic'],
    ]) {
      const bytes = findNimbusRomanFont(`ABCDEF+${legacy}`)
      expect(bytes).not.toBeNull()
      expect(bytes!.equals(loadBundledFont(`NimbusRoman-${style}.otf`)!)).toBe(true)
      expect(fontCoversText(bytes!, 'Résumé € 123')).toBe(true)
      expect(fontCoversText(bytes!, '中文')).toBe(false)
    }
    expect(findNimbusRomanFont('UnrelatedRoman-Regular')).toBeNull()
    expect(listEditFonts()).toContain('nimbus-roman')
  })

  it('ships Liberation Serif and Noto Serif SC', () => {
    expect(bundledFontsDir()).not.toBe('')
    const times = loadBundledFont('LiberationSerif-Regular.ttf')
    const song = loadBundledFont('NotoSerifSC-Regular.otf')
    expect(times).not.toBeNull()
    expect(song).not.toBeNull()
    expect(fontCoversText(times!, 'Times New Roman')).toBe(true)
    expect(fontCoversText(song!, '宋体中文编辑')).toBe(true)
  })

  it('aliases Times and SimSun onto the serif family, not Noto Sans', () => {
    const times = findAliasedBundledFont('TimesNewRomanPSMT', 'Times New Roman')
    const simsun = findAliasedBundledFont('SimSun', '宋体')
    expect(times).not.toBeNull()
    expect(simsun).not.toBeNull()
    expect(times!.equals(loadBundledFont('LiberationSerif-Regular.ttf')!)).toBe(true)
    expect(simsun!.equals(loadBundledFont('NotoSerifSC-Regular.otf')!)).toBe(true)
    expect(simsun!.equals(loadBundledFont('NotoSansSC-Regular.otf')!)).toBe(false)
  })

  it('picks a serif CJK face for Times-like fallback text', () => {
    const serif = pickBundledFallback('应付金额 900 元', 'serif')
    expect(serif).not.toBeNull()
    expect(serif!.equals(loadBundledFont('NotoSerifSC-Regular.otf')!)).toBe(true)
  })

  it('exposes times and Noto 宋体 in the editor list', () => {
    const ids = listEditFonts()
    expect(ids).toContain('times')
    expect(ids).toContain('noto-serif-sc')
    expect(ids).toContain('noto-serif')
  })
})
