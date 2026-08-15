import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = process.cwd().endsWith('/apps/pdf')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/pdf')
const css = readFileSync(resolve(workspace, 'src/renderer/styles.css'), 'utf8')

describe('PDF equation dialog styling', () => {
  it('uses defined theme surfaces instead of becoming transparent', () => {
    expect(css).toContain('.pdf-equation-dialog')
    expect(css).toContain('background: var(--surface)')
    expect(css).toContain('border: 1px solid var(--border)')
    expect(css).not.toContain('--panel-bg')
    expect(css).not.toContain('--border-color')
  })
})
