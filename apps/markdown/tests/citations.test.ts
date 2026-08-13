import { describe, expect, it } from 'vitest'
import { normalizeRecord, type CitationRecord } from '@genoffice/citations'
import { citedKeys, citationToken, syncBibliography } from '../src/renderer/markdown/citations'

function record(key: string, title: string): CitationRecord {
  return normalizeRecord({
    citationKey: key,
    title,
    authors: [{ family: 'Xu', given: 'Zhiping' }],
    year: 2026,
    source: 'test',
  })
}

describe('Markdown citation synchronization', () => {
  it('deduplicates citations, generates a trailing bibliography, and emits BibTeX', () => {
    const paper = record('xu2026ai', 'ZenMux Office')
    const records = new Map([[paper.citationKey, paper]])
    const result = syncBibliography(
      `正文 ${citationToken(paper)}，再次引用 ${citationToken(paper)}。`,
      records,
      'gb7714',
      'zh',
    )
    expect(citedKeys(result.markdown)).toEqual(['xu2026ai'])
    expect(result.markdown).toContain('## 参考文献')
    expect(result.markdown.match(/ZenMux Office/g)).toHaveLength(1)
    expect(result.bibTeX).toContain('@article{xu2026ai,')
  })

  it('removes the generated bibliography after the final citation is deleted', () => {
    const paper = record('xu2026ai', 'ZenMux Office')
    const withReferences = syncBibliography(
      `正文 ${citationToken(paper)}。`,
      new Map([[paper.citationKey, paper]]),
      'gb7714',
      'zh',
    ).markdown
    const withoutCitation = withReferences.replace(citationToken(paper), '')
    expect(syncBibliography(withoutCitation, new Map(), 'gb7714', 'zh').markdown).toBe('正文 。')
  })
})
