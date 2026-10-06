import { describe, expect, it, vi } from 'vitest'
import { createDocumentResearchSkill } from '../src/research-skill'

describe('document research skill', () => {
  it('researches from the open document and leaves editing to the caller', async () => {
    const skill = createDocumentResearchSkill({
      readDocument: () => '文档里的私有结论',
      search: async () => [{ title: '来源', url: 'https://example.com/p', snippet: '证据' }],
      send: async (prompt) => {
        if (prompt.user.includes('拆成')) return { ok: true, content: '["子问题"]' }
        if (prompt.user.includes('还缺什么')) return { ok: true, content: '[]' }
        expect(prompt.user).toContain('文档里的私有结论')
        return { ok: true, content: '报告正文' }
      },
    })
    const result = await skill.executeTool(
      { id: '1', name: 'deep_research', input: { question: '这个问题' } },
      new AbortController().signal,
    )
    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBeUndefined()
    expect(result.output).toContain('https://example.com/p')
    expect(result.summary).toContain('1 条来源')
  })

  it('runs a supervisor skill against the document text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('---\nname: idea-evaluator\n---\n# 评估方法')),
    )
    const skill = createDocumentResearchSkill({
      readDocument: () => '我的选题',
      search: async () => [],
      send: async (prompt) => {
        expect(prompt.system).toContain('评估方法')
        expect(prompt.user).toContain('我的选题')
        expect(prompt.user).not.toContain('评估方法')
        return { ok: true, content: '评估结论' }
      },
    })
    const result = await skill.executeTool({
      id: '2',
      name: 'supervisor_skill',
      input: { task: 'idea-evaluator', instruction: '看是否值得做' },
    })
    expect(result.output).toBe('评估结论')
    expect(result.summary).toBe('选题评估')
  })

  it('rejects an empty question and an unknown skill without calling the model', async () => {
    const send = vi.fn()
    const skill = createDocumentResearchSkill({
      readDocument: () => '',
      search: async () => [],
      send,
    })
    expect(
      (await skill.executeTool({ id: '3', name: 'deep_research', input: { question: '  ' } }))
        .isError,
    ).toBe(true)
    expect(
      (await skill.executeTool({ id: '4', name: 'supervisor_skill', input: { task: 'nope' } }))
        .output,
    ).toContain('未知科研技能')
    expect(send).not.toHaveBeenCalled()
  })
})
