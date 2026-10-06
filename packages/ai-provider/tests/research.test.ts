import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseQueryList, runDeepResearch } from '../src/deep-research'
import { loadSupervisorSkill, SUPERVISOR_REVISION, supervisorPrompt } from '../src/supervisor'

afterEach(() => vi.unstubAllGlobals())

describe('deep research loop', () => {
  it('parses a fenced JSON list and drops duplicates', () => {
    expect(parseQueryList('```json\n["A", "a", "B"]\n```', 4)).toEqual(['A', 'B'])
  })

  it('searches sub-queries, skips an empty reflection, and appends real sources', async () => {
    const searches: string[] = []
    const result = await runDeepResearch({
      question: '深度研究如何工作',
      maxIterations: 2,
      chat: async (prompt) => {
        if (prompt.includes('拆成')) return '["定义是什么", "和普通搜索的差别"]'
        if (prompt.includes('还缺什么')) return '[]'
        return '深度研究先拆问题再综合。'
      },
      search: async (query) => {
        searches.push(query)
        return [
          {
            title: query,
            url: `https://example.com/${encodeURIComponent(query)}`,
            snippet: '证据',
          },
        ]
      },
    })
    expect(searches).toEqual(['定义是什么', '和普通搜索的差别'])
    expect(result.report).toContain('https://example.com/')
    expect(result.report).toContain('## 检索来源')
    expect(result.sources).toHaveLength(2)
  })

  it('runs a second search when reflection finds a gap', async () => {
    const searches: string[] = []
    await runDeepResearch({
      question: '写一份报告',
      maxIterations: 2,
      chat: async (prompt) => {
        if (prompt.includes('拆成')) return '["第一部分"]'
        if (prompt.includes('还缺什么')) return '["缺口问题"]'
        return '报告正文'
      },
      search: async (query) => {
        searches.push(query)
        return []
      },
    })
    expect(searches).toEqual(['第一部分', '缺口问题'])
  })

  it('streams the report as tokens arrive', async () => {
    const seen: string[] = []
    const result = await runDeepResearch({
      question: '写报告',
      maxIterations: 1,
      chat: async (prompt) => {
        if (prompt.includes('拆成')) return '["子问题"]'
        throw new Error('报告应走流式输出')
      },
      streamReport: async (_prompt, _signal, onDelta) => {
        onDelta('报告')
        seen.push('报告')
        onDelta('报告正文')
        seen.push('报告正文')
        return '报告正文'
      },
      search: async () => [],
    })
    expect(seen).toEqual(['报告', '报告正文'])
    expect(result.report).toContain('报告正文')
  })

  it('continues the report when a search fails', async () => {
    const events: string[] = []
    const result = await runDeepResearch({
      question: '问题',
      maxIterations: 1,
      chat: async (prompt) => (prompt.includes('拆成') ? '["子问题"]' : '根据文档写的报告'),
      search: async () => {
        throw new Error('没有网页搜索')
      },
      onEvent: (event) => {
        if (event.type === 'searching') events.push(`start:${event.query}`)
        if (event.type === 'search') events.push(event.error ?? 'ok')
      },
    })
    expect(events).toEqual(['start:子问题', '没有网页搜索'])
    expect(result.report).toContain('根据文档写的报告')
  })

  it('stops before searching when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runDeepResearch({
        question: '问题',
        signal: controller.signal,
        chat: async () => '["子问题"]',
        search: async () => [],
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('supervisor skills', () => {
  it('requires material and keeps evidence out of the system rules', () => {
    expect(() => supervisorPrompt('idea-evaluator', '', '', '', '')).toThrow('研究要求')
    expect(() => supervisorPrompt('paper-polish', '润色', '', '证据', '方法')).toThrow('文档')
    const prompt = supervisorPrompt(
      'deep-research',
      '聚焦缺口',
      '草稿',
      'https://example.com/a',
      '技能',
    )
    expect(prompt.system).toContain('技能')
    expect(prompt.system).not.toContain('https://example.com/a')
    expect(prompt.user).toContain('草稿')
    expect(prompt.user).toContain('https://example.com/a')
  })

  it('loads a pinned skill and reuses it', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('---\nname: idea-evaluator\n---\n# 评估'))
    vi.stubGlobal('fetch', fetcher)
    expect(await loadSupervisorSkill('idea-evaluator')).toContain('评估')
    await loadSupervisorSkill('idea-evaluator')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      `${SUPERVISOR_REVISION}/skills/idea-evaluator/SKILL.md`,
    )
  })
})
