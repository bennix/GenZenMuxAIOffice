import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { webSearch, imageSearch } from '../src/index'

// These cases only test the Serper/DuckDuckGo paths; a local gsk login would take priority, so disable it explicitly
beforeAll(() => {
  process.env.AI_SEARCH_DISABLE_GSK = '1'
})

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.SERPER_API_KEY
})

function mockFetch(
  handler: (url: string, init?: RequestInit) => { ok: boolean; json?: any; text?: string },
) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const r = handler(String(url), init)
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      headers: new Map(),
      json: async () => r.json,
      text: async () => r.text ?? '',
    } as any
  }) as any
}

describe('webSearch (Serper)', () => {
  it('parses organic results + answer box', async () => {
    process.env.SERPER_API_KEY = 'test-key'
    mockFetch((url) => {
      expect(url).toBe('https://google.serper.dev/search')
      return {
        ok: true,
        json: {
          answerBox: { answer: '42' },
          organic: [
            { title: 'A', link: 'https://a.com', snippet: 'sa', date: 'Aug 11, 2026' },
            { title: 'B', link: 'https://b.com', snippet: 'sb' },
          ],
        },
      }
    })
    const r = await webSearch('meaning of life', 5)
    expect(r.method).toBe('serper')
    expect(r.answer).toBe('42')
    expect(r.results).toHaveLength(2)
    expect(r.results[0]).toEqual({
      title: 'A',
      url: 'https://a.com',
      snippet: 'sa',
      publishedAt: 'Aug 11, 2026',
    })
  })

  it('falls back to DuckDuckGo when no key', async () => {
    mockFetch((url) => {
      expect(url).toContain('duckduckgo.com')
      return {
        ok: true,
        text: '<a class="result__a" href="/l/?uddg=https%3A%2F%2Fx.com">X Title</a>',
      }
    })
    const r = await webSearch('q', 3)
    expect(r.method).toBe('duckduckgo')
    expect(r.results[0]?.url).toBe('https://x.com')
    expect(r.results[0]?.title).toBe('X Title')
  })
})

describe('webSearch (market quote)', () => {
  it('resolves a company and returns a timestamped structured quote', async () => {
    mockFetch((url) => {
      if (url.includes('/v1/finance/search')) {
        return {
          ok: true,
          json: { quotes: [{ symbol: 'GOOGL', quoteType: 'EQUITY' }] },
        }
      }
      expect(url).toContain('/v8/finance/chart/GOOGL')
      return {
        ok: true,
        json: {
          chart: {
            result: [
              {
                meta: {
                  symbol: 'GOOGL',
                  longName: 'Alphabet Inc.',
                  currency: 'USD',
                  fullExchangeName: 'NasdaqGS',
                  regularMarketPrice: 343.8,
                  regularMarketTime: 1786478401,
                },
              },
            ],
          },
        },
      }
    })
    const r = await webSearch('谷歌 Alphabet 股价', 6)
    expect(r.method).toBe('yahoo-finance')
    expect(r.answer).toContain('343.8 USD')
    expect(r.answer).toContain('Quote time:')
    expect(r.results[0]).toMatchObject({
      title: expect.stringContaining('Alphabet Inc.'),
      url: 'https://finance.yahoo.com/quote/GOOGL/',
    })
  })

  it('does not call finance endpoints for ordinary research', async () => {
    process.env.SERPER_API_KEY = 'test-key'
    mockFetch((url) => {
      expect(url).toBe('https://google.serper.dev/search')
      return { ok: true, json: { organic: [{ title: 'A', link: 'https://a.com' }] } }
    })
    expect((await webSearch('Alphabet company history', 3)).method).toBe('serper')
  })
})

describe('imageSearch (Serper)', () => {
  it('parses images + filters copyright hosts', async () => {
    process.env.SERPER_API_KEY = 'test-key'
    mockFetch((url) => {
      expect(url).toBe('https://google.serper.dev/images')
      return {
        ok: true,
        json: {
          images: [
            {
              title: 'good',
              imageUrl: 'https://cdn.example.com/a.jpg',
              link: 'https://example.com',
              imageWidth: 800,
              imageHeight: 600,
            },
            {
              title: 'paid',
              imageUrl: 'https://gettyimages.com/x.jpg',
              link: 'https://gettyimages.com',
            },
          ],
        },
      }
    })
    const r = await imageSearch('cats', 8)
    expect(r.method).toBe('serper')
    expect(r.images).toHaveLength(1) // getty is filtered out
    expect(r.images[0]).toMatchObject({
      imageUrl: 'https://cdn.example.com/a.jpg',
      width: 800,
      height: 600,
    })
  })
})
