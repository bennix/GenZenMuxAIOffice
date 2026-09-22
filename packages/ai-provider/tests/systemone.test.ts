import { afterEach, describe, expect, it } from 'vitest'
import { askSystemOne } from '../src/systemone'

describe('askSystemOne', () => {
  const original = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = original
  })

  it('posts the saved model to the ZenMux systemone endpoint', async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://zenmux.ai/api/v1/systemone')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer zen-key' })
      const body = JSON.parse(String(init.body))
      expect(body.model).toBe('typesafe/jev-1.13')
      expect(body.questions.needs_change.type).toBe('noul')
      return new Response(
        JSON.stringify({
          model: 'typesafe/jev-1.13',
          answers: { needs_change: { type: 'noul', noul: 0.87 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await askSystemOne({
      apiKey: 'zen-key',
      baseUrl: 'https://zenmux.ai/api/v1',
      model: 'typesafe/jev-1.13',
      state: 'slide',
      questions: { needs_change: { type: 'noul', instructions: 'Does it need a fix?' } },
    })
    expect(result).toEqual({
      ok: true,
      model: 'typesafe/jev-1.13',
      answers: { needs_change: { type: 'noul', noul: 0.87 } },
    })
  })
})
