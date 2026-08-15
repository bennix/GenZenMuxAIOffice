import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspacePath = resolve(process.cwd(), 'src/renderer/styles.css')
const cssPath = existsSync(workspacePath)
  ? workspacePath
  : resolve(process.cwd(), 'apps/docs/src/renderer/styles.css')
const css = readFileSync(cssPath, 'utf8')

describe('direct PDF print layout', () => {
  it('keeps the physical DOCX page width instead of expanding to the browser viewport', () => {
    const printCss = css.slice(css.indexOf('@media print'))
    expect(printCss).toMatch(
      /\.doc-page\s*\{[\s\S]*?width:\s*var\(--page-w,\s*816px\)\s*!important/,
    )
    expect(printCss).not.toMatch(/\.doc-page\s*\{[\s\S]*?width:\s*auto\s*!important/)
  })

  it('removes protected-object selection chrome from exported pages', () => {
    const printCss = css.slice(css.indexOf('@media print'))
    expect(printCss).toMatch(
      /\.doc-protected,[\s\S]*?border-color:\s*transparent\s*!important;[\s\S]*?outline:\s*none\s*!important/,
    )
  })
})
