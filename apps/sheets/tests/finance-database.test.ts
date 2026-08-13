import { describe, expect, it } from 'vitest'
import { filterFinanceDatabaseRows, financeDatabaseSourceUrl } from '../src/shared/finance-database'

describe('FinanceDatabase integration', () => {
  it('builds fixed raw GitHub paths for global and exchange-split assets', () => {
    expect(financeDatabaseSourceUrl('indices')).toBe(
      'https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database/indices.csv',
    )
    expect(financeDatabaseSourceUrl('equities', ' nyq ')).toBe(
      'https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database/equities/NYQ.csv',
    )
  })

  it('rejects path traversal in exchange codes', () => {
    expect(() => financeDatabaseSourceUrl('funds', '../LICENSE')).toThrow(/exchange/i)
  })

  it('filters every metadata column case-insensitively and enforces the limit', () => {
    const rows = [
      ['AAPL', 'Apple Inc.', 'Technology', 'United States'],
      ['MSFT', 'Microsoft', 'Technology', 'United States'],
      ['ASML.AS', 'ASML Holding', 'Semiconductors', 'Netherlands'],
    ]
    expect(filterFinanceDatabaseRows(rows, 'netherlands', 20)).toEqual([rows[2]])
    expect(filterFinanceDatabaseRows(rows, 'technology', 1)).toEqual([rows[0]])
  })
})
