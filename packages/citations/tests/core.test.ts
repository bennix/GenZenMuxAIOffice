import { describe, expect, it } from 'vitest'
import {
  bibliographyEntry,
  dedupeRecords,
  inlineCitation,
  parseBibTeX,
  parseCslJson,
  parseRis,
} from '../src/core'

describe('citation import and rendering', () => {
  it('imports BibTeX and preserves its citation key', () => {
    const [record] = parseBibTeX(`@article{xu2026ai,
      title={Reliable AI Office}, author={Xu, Zhiping and Doe, Jane}, year={2026},
      journal={Journal of Tests}, doi={10.1000/test}
    }`)
    expect(record?.citationKey).toBe('xu2026ai')
    expect(record?.authors[0]).toEqual({ family: 'Xu', given: 'Zhiping' })
    expect(record?.doi).toBe('10.1000/test')
  })

  it('imports RIS and CSL-JSON', () => {
    expect(
      parseRis('TY  - JOUR\nTI  - A paper\nAU  - Xu, Zhiping\nPY  - 2025\nER  -')[0]?.title,
    ).toBe('A paper')
    expect(
      parseCslJson(
        '[{"id":"x","type":"article-journal","title":"B","issued":{"date-parts":[[2024]]}}]',
      )[0]?.year,
    ).toBe(2024)
  })

  it('deduplicates DOI variants and renders common styles', () => {
    const records = dedupeRecords([
      {
        id: '1',
        citationKey: 'a',
        type: 'article-journal',
        title: 'A',
        authors: [{ family: 'Xu' }],
        year: 2026,
        doi: 'https://doi.org/10.1/X',
        source: 'A',
        isPreprint: false,
      },
      {
        id: '2',
        citationKey: 'b',
        type: 'article-journal',
        title: 'A',
        authors: [{ family: 'Xu' }],
        year: 2026,
        doi: '10.1/x',
        source: 'B',
        isPreprint: false,
      },
    ])
    expect(records).toHaveLength(1)
    expect(inlineCitation(records[0]!, 'apa7')).toBe('(Xu, 2026)')
    expect(bibliographyEntry(records[0]!, 'ieee', 2)).toContain('[2]')
  })
})
