import { useEffect, useMemo, useState } from 'react'
import {
  bibliographyEntry,
  dedupeRecords,
  exportBibTeX,
  exportCslJson,
  inlineCitation,
  parseImport,
} from './core'
import { searchScholarly } from './search'
import type { CitationRecord, CitationStyle, SearchSource } from './types'

const STORE_KEY = 'genoffice.citation-library.v1'
const SOURCE_OPTIONS: Array<{ id: SearchSource; label: string }> = [
  { id: 'openalex', label: 'OpenAlex' },
  { id: 'crossref', label: 'Crossref' },
  { id: 'semantic-scholar', label: 'Semantic Scholar' },
  { id: 'pubmed', label: 'PubMed' },
  { id: 'europe-pmc', label: 'Europe PMC' },
  { id: 'arxiv', label: 'arXiv' },
]
const PORTALS = [
  ['Google Scholar', 'https://scholar.google.com/'],
  ['CORE', 'https://core.ac.uk/'],
  ['BASE', 'https://www.base-search.net/'],
  ['OALib', 'https://www.oalib.com/'],
  ['DOAJ', 'https://doaj.org/'],
  ['PubMed', 'https://pubmed.ncbi.nlm.nih.gov/'],
  ['PubMed Central', 'https://pmc.ncbi.nlm.nih.gov/'],
  ['bioRxiv', 'https://www.biorxiv.org/'],
  ['medRxiv', 'https://www.medrxiv.org/'],
  ['SSRN', 'https://www.ssrn.com/'],
  ['OSF Preprints', 'https://osf.io/preprints/'],
  ['百度学术', 'https://xueshu.baidu.com/'],
  ['PubScholar', 'https://pubscholar.cn/'],
  ['GoOA', 'http://gooa.las.ac.cn/'],
  ['COAJ', 'https://www.coaj.cn/'],
  ['NSSD', 'https://www.nssd.cn/'],
  ['NSTL', 'https://www.nstl.gov.cn/'],
  ['ERIC', 'https://eric.ed.gov/'],
  ['ResearchGate', 'https://www.researchgate.net/'],
  ['Academia.edu', 'https://www.academia.edu/'],
  ['OpenDOAR', 'https://v2.sherpa.ac.uk/opendoar/'],
  ['Unpaywall', 'https://unpaywall.org/'],
] as const

function loadLibrary(): CitationRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export interface CitationManagerProps {
  onClose(): void
  onInsertCitation(record: CitationRecord, rendered: string): void
  onInsertBibliography(records: CitationRecord[], rendered: string[]): void
  aiAssist?: (query: string) => Promise<string>
  language?: 'zh' | 'en'
}

export function CitationManager({
  onClose,
  onInsertCitation,
  onInsertBibliography,
  aiAssist,
  language = navigator.language.startsWith('zh') ? 'zh' : 'en',
}: CitationManagerProps) {
  const zh = language === 'zh'
  const [tab, setTab] = useState<'search' | 'library' | 'import' | 'portals'>('search')
  const [library, setLibrary] = useState<CitationRecord[]>(loadLibrary)
  const [results, setResults] = useState<CitationRecord[]>([])
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState<SearchSource[]>(SOURCE_OPTIONS.map((s) => s.id))
  const [style, setStyle] = useState<CitationStyle>('gb7714')
  const [selected, setSelected] = useState<string[]>([])
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(library))
  }, [library])
  const selectedRecords = useMemo(
    () => library.filter((r) => selected.includes(r.id)),
    [library, selected],
  )
  const add = (record: CitationRecord) => {
    setLibrary((old) => dedupeRecords([...old, record]))
    setNotice(zh ? '已导入本地文献库' : 'Added to local library')
  }
  const runSearch = async (searchQuery = query) => {
    if (!searchQuery.trim()) return
    setBusy(true)
    setNotice(zh ? '正在查询公开学术索引…' : 'Searching public scholarly indexes…')
    try {
      const response = await searchScholarly(searchQuery, { sources, limit: 8 })
      setResults(response.records)
      setNotice(
        response.records.length
          ? response.errors.length
            ? zh
              ? `找到 ${response.records.length} 条；部分入口暂不可用`
              : `${response.records.length} found; some sources unavailable`
            : zh
              ? `找到 ${response.records.length} 条`
              : `${response.records.length} results`
          : zh
            ? '没有找到结果，请更换关键词或检查网络'
            : 'No results; change keywords or check the network',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const improveQuery = async () => {
    if (!aiAssist || !query.trim()) return
    setBusy(true)
    setNotice(zh ? 'ZenMux 正在扩展检索词…' : 'ZenMux is expanding the query…')
    try {
      const improved = (await aiAssist(query)).trim().replace(/^['"]|['"]$/g, '')
      setQuery(improved)
      await runSearch(improved)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }
  const doImport = () => {
    try {
      const parsed = parseImport(importText)
      if (!parsed.length) throw new Error(zh ? '未识别到文献记录' : 'No records recognized')
      setLibrary((old) => dedupeRecords([...old, ...parsed]))
      setImportText('')
      setNotice(zh ? `已导入 ${parsed.length} 条记录` : `Imported ${parsed.length} records`)
      setTab('library')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const insertBibliography = () => {
    const records = selectedRecords.length ? selectedRecords : library
    onInsertBibliography(
      records,
      records.map((r, i) => bibliographyEntry(r, style, i + 1)),
    )
    onClose()
  }
  const download = (kind: 'bib' | 'json') => {
    const body = kind === 'bib' ? exportBibTeX(library) : exportCslJson(library)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    a.download = `genoffice-library.${kind}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div
      className="citation-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="citation-manager" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>{zh ? '科研文献与引用' : 'Scholarly references'}</h2>
            <p>
              {zh
                ? '真实元数据来自公开学术索引；AI 辅助仅通过 ZenMux，不会虚构书目信息。'
                : 'Metadata comes from public indexes; AI assistance uses ZenMux and never invents bibliography data.'}
            </p>
          </div>
          <button onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>
            ×
          </button>
        </header>
        <nav>
          {(
            [
              ['search', zh ? '在线检索' : 'Search'],
              ['library', zh ? '本地文献库' : 'Library'],
              ['import', zh ? '导入/导出' : 'Import/export'],
              ['portals', zh ? '官方入口' : 'Official portals'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="citation-toolbar">
          <label>
            {zh ? '引用样式' : 'Style'}{' '}
            <select value={style} onChange={(e) => setStyle(e.target.value as CitationStyle)}>
              <option value="gb7714">GB/T 7714</option>
              <option value="apa7">APA 7</option>
              <option value="ieee">IEEE</option>
              <option value="nature">Nature</option>
              <option value="vancouver">Vancouver</option>
            </select>
          </label>
          <span>{notice}</span>
        </div>
        <main>
          {tab === 'search' && (
            <>
              <div className="citation-search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                  placeholder={
                    zh ? '题名、作者、DOI、PMID 或关键词' : 'Title, author, DOI, PMID, or keywords'
                  }
                />
                <button disabled={busy || !query.trim()} onClick={() => void runSearch()}>
                  {zh ? '查询' : 'Search'}
                </button>
                {aiAssist && (
                  <button disabled={busy || !query.trim()} onClick={() => void improveQuery()}>
                    {zh ? 'ZenMux 扩展检索' : 'Expand with ZenMux'}
                  </button>
                )}
              </div>
              <div className="citation-sources">
                {SOURCE_OPTIONS.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={sources.includes(s.id)}
                      onChange={() =>
                        setSources((old) =>
                          old.includes(s.id) ? old.filter((x) => x !== s.id) : [...old, s.id],
                        )
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <RecordList
                records={results}
                library={library}
                style={style}
                zh={zh}
                onAdd={add}
                onCite={(r, index) => {
                  onInsertCitation(r, inlineCitation(r, style, index))
                  onClose()
                }}
              />
            </>
          )}
          {tab === 'library' && (
            <>
              <div className="citation-library-actions">
                <button disabled={!library.length} onClick={insertBibliography}>
                  {zh
                    ? `插入参考文献表${selected.length ? `（${selected.length}）` : ''}`
                    : `Insert bibliography${selected.length ? ` (${selected.length})` : ''}`}
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() => setLibrary((old) => old.filter((r) => !selected.includes(r.id)))}
                >
                  {zh ? '移除所选' : 'Remove selected'}
                </button>
              </div>
              <RecordList
                records={library}
                library={library}
                style={style}
                zh={zh}
                selected={selected}
                onSelect={(id) =>
                  setSelected((old) =>
                    old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
                  )
                }
                onCite={(r, index) => {
                  onInsertCitation(r, inlineCitation(r, style, index))
                  onClose()
                }}
              />
            </>
          )}
          {tab === 'import' && (
            <>
              <p>
                {zh
                  ? '粘贴 BibTeX、RIS 或 CSL-JSON。导入后可在三个编辑器中重复引用。'
                  : 'Paste BibTeX, RIS, or CSL-JSON for reusable citation.'}
              </p>
              <textarea
                rows={12}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="@article{...} / TY  - JOUR / [{...}]"
              />
              <div className="citation-library-actions">
                <button disabled={!importText.trim()} onClick={doImport}>
                  {zh ? '识别并导入' : 'Parse and import'}
                </button>
                <button disabled={!library.length} onClick={() => download('bib')}>
                  BibTeX
                </button>
                <button disabled={!library.length} onClick={() => download('json')}>
                  CSL-JSON
                </button>
              </div>
            </>
          )}
          {tab === 'portals' && (
            <>
              <p>
                {zh
                  ? '以下平台在系统浏览器打开。对于无稳定公开 API、需登录或限制自动访问的平台，本应用不抓取结果。'
                  : 'These open in your browser. The app does not scrape services without a stable public API or requiring login.'}
              </p>
              <div className="citation-portals">
                {PORTALS.map(([name, url]) => (
                  <button
                    key={name}
                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  >
                    {name}
                    <small>{new URL(url).hostname}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </main>
        <footer>
          {zh
            ? '网络或代理会影响 AI 与文献查询。请优先使用合法开放获取版本，并区分预印本与正式同行评审版本。'
            : 'Network or proxy conditions affect AI and search. Prefer lawful open-access copies and distinguish preprints from peer-reviewed versions.'}
        </footer>
      </div>
    </div>
  )
}

function RecordList({
  records,
  library,
  style,
  zh,
  onAdd,
  onCite,
  selected,
  onSelect,
}: {
  records: CitationRecord[]
  library: CitationRecord[]
  style: CitationStyle
  zh: boolean
  onAdd?: (r: CitationRecord) => void
  onCite: (r: CitationRecord, index: number) => void
  selected?: string[]
  onSelect?: (id: string) => void
}) {
  return (
    <div className="citation-records">
      {records.map((r, index) => (
        <article key={r.id}>
          {onSelect && (
            <input
              type="checkbox"
              checked={selected?.includes(r.id)}
              onChange={() => onSelect(r.id)}
            />
          )}
          <div>
            <h3>{r.title}</h3>
            <p>
              {r.authors
                .map((a) => a.literal || [a.given, a.family].filter(Boolean).join(' '))
                .join(', ')}
              {r.year ? ` · ${r.year}` : ''}
              {r.containerTitle ? ` · ${r.containerTitle}` : ''}
            </p>
            <div className="citation-badges">
              <span>{r.source}</span>
              {r.doi && <span>DOI</span>}
              {r.openAccess && <span>OA</span>}
              {r.isPreprint ? (
                <span className="warn">{zh ? '预印本' : 'Preprint'}</span>
              ) : (
                r.peerReviewed && <span>{zh ? '正式出版' : 'Published'}</span>
              )}
            </div>
            <small>{bibliographyEntry(r, style, index + 1)}</small>
          </div>
          <aside>
            {onAdd && (
              <button disabled={library.some((x) => x.id === r.id)} onClick={() => onAdd(r)}>
                {library.some((x) => x.id === r.id)
                  ? zh
                    ? '已导入'
                    : 'Added'
                  : zh
                    ? '导入'
                    : 'Add'}
              </button>
            )}
            <button onClick={() => onCite(r, index + 1)}>{zh ? '引用' : 'Cite'}</button>
            {(r.pdfUrl || r.url) && (
              <button
                onClick={() => window.open(r.pdfUrl || r.url, '_blank', 'noopener,noreferrer')}
              >
                {zh ? '全文/来源' : 'Full text/source'}
              </button>
            )}
          </aside>
        </article>
      ))}
      {!records.length && <div className="citation-empty">{zh ? '暂无记录' : 'No records'}</div>}
    </div>
  )
}
