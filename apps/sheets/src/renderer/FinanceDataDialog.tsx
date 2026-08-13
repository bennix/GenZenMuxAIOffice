import { useMemo, useState } from 'react'
import type { FinanceDatabaseAsset } from '../shared/desktop-api'
import { parseCsv } from '../gateway/csv-import'
import { filterFinanceDatabaseRows } from '../shared/finance-database'

const ASSETS: Array<{ value: FinanceDatabaseAsset; zh: string; en: string; split: boolean }> = [
  { value: 'equities', zh: '股票', en: 'Equities', split: true },
  { value: 'etfs', zh: 'ETF', en: 'ETFs', split: true },
  { value: 'funds', zh: '基金', en: 'Funds', split: true },
  { value: 'indices', zh: '指数', en: 'Indices', split: false },
  { value: 'currencies', zh: '货币对', en: 'Currencies', split: false },
  { value: 'cryptos', zh: '加密资产', en: 'Crypto assets', split: false },
  { value: 'moneymarkets', zh: '货币市场', en: 'Money markets', split: false },
]

export interface FinanceDataImport {
  rows: string[][]
  sourceUrl: string
  retrievedAt: string
  assetLabel: string
}

export function FinanceDataDialog({
  onImport,
  onClose,
}: {
  onImport: (data: FinanceDataImport) => void
  onClose: () => void
}) {
  const zh = navigator.language.toLowerCase().startsWith('zh')
  const [asset, setAsset] = useState<FinanceDatabaseAsset>('equities')
  const [exchange, setExchange] = useState('NYQ')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(200)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = useMemo(() => ASSETS.find((item) => item.value === asset)!, [asset])

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.desktopApi.fetchFinanceDatabase(
        asset,
        selected.split ? exchange : undefined,
      )
      const parsed = parseCsv(result.csv)
      const header = parsed[0] ?? []
      const records = filterFinanceDatabaseRows(parsed.slice(1), query, limit)
      if (!header.length || !records.length) {
        throw new Error(
          zh ? '没有找到匹配的金融标的。' : 'No matching financial instruments found.',
        )
      }
      onImport({
        rows: [header, ...records],
        sourceUrl: result.sourceUrl,
        retrievedAt: result.retrievedAt,
        assetLabel: zh ? selected.zh : selected.en,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="finance-data-dialog" role="dialog" aria-modal="true">
        <header>{zh ? '金融数据 · FinanceDatabase' : 'Financial Data · FinanceDatabase'}</header>
        <p className="dialog-note">
          {zh
            ? '用于查询金融标的基础信息与分类，不包含实时行情或最新基本面。数据来自 FinanceDatabase（MIT）；网络或代理状态可能影响查询。'
            : 'Searches instrument metadata and classifications, not live prices or current fundamentals. Data: FinanceDatabase (MIT). Network or proxy conditions may affect access.'}
        </p>
        <div className="dialog-grid">
          <label>
            {zh ? '资产类别' : 'Asset class'}
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as FinanceDatabaseAsset)}
            >
              {ASSETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {zh ? item.zh : item.en}
                </option>
              ))}
            </select>
          </label>
          {selected.split && (
            <label>
              {zh ? '交易所代码' : 'Exchange code'}
              <input
                value={exchange}
                onChange={(e) => setExchange(e.target.value.toUpperCase())}
                placeholder="NYQ / NMS / HKG / SHH / SHZ"
              />
            </label>
          )}
          <label className="dialog-span">
            {zh
              ? '关键词（代码、名称、国家、行业等）'
              : 'Keyword (symbol, name, country, industry…)'}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            {zh ? '最多导入' : 'Maximum rows'}
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[50, 100, 200, 500, 1000].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <div className="dialog-error">{error}</div>}
        <footer className="dialog-actions">
          <button
            onClick={() =>
              void window.desktopApi.openExternal('https://github.com/JerBouma/FinanceDatabase')
            }
          >
            {zh ? '查看数据源' : 'View source'}
          </button>
          <button onClick={onClose}>{zh ? '取消' : 'Cancel'}</button>
          <button
            className="primary"
            disabled={busy || (selected.split && !exchange.trim())}
            onClick={() => void load()}
          >
            {busy ? (zh ? '查询中…' : 'Loading…') : zh ? '查询并导入' : 'Search & import'}
          </button>
        </footer>
      </div>
    </div>
  )
}
