import type { FinanceDatabaseAsset } from './desktop-api'

const SPLIT_ASSETS = new Set<FinanceDatabaseAsset>(['equities', 'etfs', 'funds'])
const EXCHANGE_PATTERN = /^[A-Z0-9._-]{2,12}$/

export function financeDatabaseSourceUrl(asset: FinanceDatabaseAsset, exchange?: string): string {
  const split = SPLIT_ASSETS.has(asset)
  const code = exchange?.trim().toUpperCase() ?? ''
  if (split && !EXCHANGE_PATTERN.test(code)) throw new Error('Invalid exchange code.')
  const relative = split ? `${asset}/${code}.csv` : `${asset}.csv`
  return `https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database/${relative}`
}

export function filterFinanceDatabaseRows(
  rows: string[][],
  query: string,
  limit: number,
): string[][] {
  const needle = query.trim().toLocaleLowerCase()
  return rows
    .filter((row) => !needle || row.some((cell) => cell.toLocaleLowerCase().includes(needle)))
    .slice(0, Math.max(0, Math.min(1000, Math.trunc(limit))))
}
