import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = process.cwd().endsWith('/apps/pdf')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/pdf')
const modal = readFileSync(resolve(workspace, 'src/renderer/PdfReviewCommitteeModal.tsx'), 'utf8')
const app = readFileSync(resolve(workspace, 'src/renderer/App.tsx'), 'utf8')

describe('PDF AI review committee', () => {
  it('reuses the shared strict committee and routes every reviewer through PDF ZenMux AI', () => {
    expect(modal).toContain('REVIEW_PROFILES')
    expect(modal).toContain('assignReviewModels')
    expect(modal).toContain('availableReviewModels')
    expect(modal).toContain('profile.members.length + 1')
    expect(modal.match(/window\.pdfApi\.aiChat/g)).toHaveLength(2)
    expect(modal).toContain('settings.providers.zenmux.apiKey')
  })

  it('reviews page-labelled text and at most five representative visual pages', () => {
    expect(modal).toContain('const MAX_VISUAL_PAGES = 5')
    expect(modal).toContain('`[Page ${i + 1}]')
    expect(modal).toContain('renderPagePreviews')
    expect(modal).toContain('formulas, charts, tables, diagrams, figures')
    expect(modal).toContain('pages without a preview')
  })

  it('exposes a PDF ribbon entry and mounts the read-only report modal', () => {
    expect(app).toContain('<IconAiReview />')
    expect(app).toContain('setReviewOpen(true)')
    expect(app).toContain('<PdfReviewCommitteeModal')
    expect(app).toContain('getSearchIndex={getSearchIndex}')
  })

  it('reuses the AI reply copy and Connect delivery paths for every report', () => {
    expect(modal).toContain('copyTextToClipboard')
    expect(modal).toContain('<ConnectButton api={window.pdfApi} text={result.content} />')
    expect(modal).toContain('<ConnectButton api={window.pdfApi} text={report} />')
    expect(modal).toContain('复制回复 / Copy reply')
  })
})
