import { describe, expect, it } from 'vitest'
import { formatNoveltyEvidence, parseNoveltyQueries } from '../src/novelty'

describe('novelty literature evidence', () => {
  it('accepts fenced JSON queries and limits them to three', () => {
    expect(
      parseNoveltyQueries(
        '```json\n{"queries":["graph neural networks", "temporal leakage", "causal benchmark", "ignored"]}\n```',
        '',
      ),
    ).toEqual(['graph neural networks', 'temporal leakage', 'causal benchmark'])
  })

  it('never presents an empty result as evidence of novelty', () => {
    const evidence = formatNoveltyEvidence(['rare method'], [])
    expect(evidence).toContain('not evidence of novelty')
    expect(evidence).toContain('could not be externally verified')
  })
})
