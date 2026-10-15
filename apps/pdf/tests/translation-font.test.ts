import { expect, it } from 'vitest'
import { translationFont, translationParagraph } from '../src/shared/translation-font'

it('uses a target-language font only when the user selects automatic font selection', () => {
  expect(translationFont('auto', 'zh', 'NimbusRomNo9L-Regu')).toBe('noto-serif-sc')
  expect(translationFont('auto', 'zh', 'Helvetica')).toBe('noto-sc')
  expect(translationFont('auto', 'zh-TW', 'NimbusRoman-Regular')).toBe('noto-tc')
  expect(translationFont('auto', 'ja', 'Helvetica')).toBe('noto-jp')
  expect(translationFont('auto', 'ko', 'Helvetica')).toBe('noto-kr')
  expect(translationFont(undefined, 'zh', 'NimbusRoman-Regular')).toBeUndefined()
  expect(translationFont('nimbus-roman', 'zh', 'Helvetica')).toBe('nimbus-roman')
})
it('removes physical line wraps and joins line-end hyphenation before translation', () => {
  expect(translationParagraph('Data transfor-\nmations preserve\noriginal meaning.')).toBe(
    'Data transformations preserve original meaning.',
  )
  expect(translationParagraph('local-first\nworkflows')).toBe('local-first workflows')
})
