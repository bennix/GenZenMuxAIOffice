import { afterEach, expect, it, vi } from 'vitest'
import { parseDuckDuckGo, searchPromptSources, suggestPromptDetails } from './promptResearch'
import { chatCompletion } from './zenmux'
import { useSettings } from '../store/settingsStore'

vi.mock('./zenmux', () => ({ chatCompletion: vi.fn() }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('parses DuckDuckGo instant answers and nested topics without unsafe links or HTML', () => {
  const results = parseDuckDuckGo({
    Heading: 'Coffee',
    AbstractText: '<b>Coffee</b> beverage',
    AbstractURL: 'https://example.org/coffee',
    RelatedTopics: [
      {
        Topics: [
          { Text: 'Design', FirstURL: 'https://example.org/design' },
          { Text: 'unsafe', FirstURL: 'javascript:alert(1)' },
        ],
      },
    ],
  })
  expect(results).toHaveLength(2)
  expect(results[0].summary).toBe('Coffee beverage')
  expect(results[1].url).toBe('https://example.org/design')
})

it('keeps partial results when a free provider fails, sends no credentials, and queries recent news only on request', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('wikipedia')) throw new Error('offline')
    if (url.includes('openlibrary')) return { ok: true, json: async () => ({ docs: [] }) }
    if (url.includes('gdelt'))
      return {
        ok: true,
        json: async () => ({
          articles: [
            { title: 'Coffee news', url: 'https://example.org/news', seendate: '20260910T120000Z' },
          ],
        }),
      }
    return {
      ok: true,
      json: async () => ({
        Heading: 'Coffee',
        AbstractText: 'Coffee overview',
        AbstractURL: 'https://example.org/coffee',
      }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  const result = await searchPromptSources('coffee', 'en', undefined, true)
  expect(result.sources).toHaveLength(2)
  expect(result.warnings[0]).toContain('Wikipedia')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('timespan=7d'),
    expect.objectContaining({ credentials: 'omit' }),
  )
  fetchMock.mockClear()
  await searchPromptSources('coffee', 'en')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('rejects suggestions for populated fields and unsupported facts', async () => {
  useSettings.setState({
    apiKey: 'test',
    models: [{ id: 'chat-test', name: 'Chat', category: 'chat', isDefault: true }],
  })
  vi.mocked(chatCompletion).mockResolvedValue({
    finishReason: 'stop',
    message: {
      role: 'assistant',
      content: JSON.stringify({
        suggestions: [
          { fieldKey: 'title', value: 'overwrite', kind: 'creative' },
          {
            fieldKey: 'color',
            value: 'warm brown',
            reason: 'palette',
            kind: 'creative',
            sourceIds: [],
          },
          { fieldKey: '_idea', value: 'fabricated fact', kind: 'fact', sourceIds: ['fake'] },
          { fieldKey: '_idea', value: 'Coffee overview', kind: 'fact', sourceIds: ['ddg-0'] },
        ],
      }),
    },
  })
  const result = await suggestPromptDetails({
    brief: 'coffee poster',
    template: 'poster',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'color', label: 'Color' },
    ],
    values: { title: 'Keep me' },
    constraints: '',
    sources: [
      {
        id: 'ddg-0',
        title: 'Coffee',
        summary: 'Coffee overview',
        url: 'https://example.org',
        provider: 'DDG',
      },
    ],
  })
  expect(result.map((item) => item.value)).toEqual(['warm brown', 'Coffee overview'])
  expect(vi.mocked(chatCompletion).mock.calls[0][1][0].content).toContain('不可信的数据')
})
