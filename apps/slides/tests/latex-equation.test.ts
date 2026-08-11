import { describe, expect, it } from 'vitest'
import {
  latexEquationDescr,
  latexFromEquationDescr,
  latexToMathML,
} from '../src/renderer/latex-equation'

describe('LaTeX equation metadata', () => {
  it('round-trips Unicode and reserved characters through PPTX description metadata', () => {
    const latex = String.raw`\frac{α + β}{2} = x^2 & y`
    expect(latexFromEquationDescr(latexEquationDescr(latex))).toBe(latex)
  })

  it('ignores unrelated or malformed picture descriptions', () => {
    expect(latexFromEquationDescr('ordinary picture')).toBeNull()
    expect(latexFromEquationDescr('genoffice-latex:%E0%A4%A')).toBeNull()
  })

  it('converts supported LaTeX to renderable MathML', () => {
    const mathml = latexToMathML(String.raw`x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}`)
    expect(mathml).toContain('<math')
    expect(mathml).toContain('<mfrac>')
  })
})
