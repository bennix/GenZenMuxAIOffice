// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { parseAcademicHumanize, type ToneEditor } from './less-ai-tone'
import {
  academicWorkflowRequest,
  parseAcademicAudit,
  parseAcademicResult,
} from './academic-workflow'
import { LessAiToneStudio } from './LessAiToneStudio'

const segments = [
  {
    id: 0,
    from: 1,
    context: 'paragraph',
    text: 'Our results suggest a 20% gain (Smith, 2024), with $x+y$.',
  },
]

describe('academic humanizer', () => {
  it('passes academic guidance and author context without general Chinese instructions', () => {
    const request = academicWorkflowRequest(segments, 'An author sample.', {
      kind: 'proposal',
      venue: 'NSF',
      focus: 'evidence',
    })
    expect(request.system).toContain('claim <-> feasibility')
    expect(request.system).toContain('不得编造')
    expect(request.system).not.toContain('你在做中文润色')
    expect(JSON.parse(request.user)).toMatchObject({
      documentType: 'proposal',
      targetVenue: 'NSF',
      focus: 'evidence',
      authorSample: 'An author sample.',
    })
  })
  it('rejects changed citation names, equations and numbers', () => {
    for (const rewritten of [
      segments[0]!.text.replace('Smith', 'Jones'),
      segments[0]!.text.replace('$x+y$', '$x-y$'),
      segments[0]!.text.replace('20%', '30%'),
    ])
      expect(() => parseAcademicHumanize(rewritten, segments)).toThrow()
    expect(
      parseAcademicHumanize(segments[0]!.text.replace('Our results', 'The results'), segments),
    ).toHaveLength(1)
  })
  it('validates exact audit quotes and refuses missing segments or missing reports', () => {
    const audit = {
      issues: [{ id: 0, quote: 'invented quote', layer: 2, pattern: 'claim', fix: 'check' }],
      claims: [],
      voice: [],
      authorQuestions: [],
    }
    expect(() => parseAcademicAudit(JSON.stringify(audit), segments)).toThrow('原文')
    expect(() => parseAcademicResult(JSON.stringify({ segments: [] }), segments)).toThrow('遗漏')
    expect(() =>
      parseAcademicResult(
        JSON.stringify({ segments: [{ id: 0, text: segments[0]!.text }] }),
        segments,
      ),
    ).toThrow('报告')
    const report = {
      changes: [],
      evidenceNotes: [],
      voiceNotes: [],
      authorQuestions: [],
      preservation: '保留原文',
    }
    expect(
      parseAcademicResult(
        JSON.stringify({ segments: [{ id: 0, text: segments[0]!.text }], report }),
        segments,
      ).changes,
    ).toEqual([])
  })
  it('exposes the academic workflow and waits for review before changing the document', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    HTMLDialogElement.prototype.showModal = vi.fn()
    const schema = new Schema({
      nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} },
    })
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text(segments[0]!.text)]),
      ]),
    })
    const editor = {
      get state() {
        return state
      },
      schema,
      isEditable: true,
      view: {
        dispatch(tr: Parameters<typeof state.apply>[0]) {
          state = state.apply(tr)
        },
      },
    } as ToneEditor
    const generate = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [],
          claims: [],
          voice: ['正式学术语体'],
          authorQuestions: ['请核对基线'],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          segments: [{ id: 0, text: segments[0]!.text.replace('Our results', 'The results') }],
          report: {
            changes: [{ id: 0, reason: '调整主语' }],
            evidenceNotes: ['保留已有依据'],
            voiceNotes: ['保持正式语体'],
            authorQuestions: ['核实基线'],
            preservation: '数字公式引用保留',
          },
        }),
      )
    const onClose = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () =>
        root.render(<LessAiToneStudio editor={editor} generate={generate} onClose={onClose} />),
      )
      expect(host.querySelector('[aria-label="文稿类型"]')).toBeNull()
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-template="paper"]')!.click(),
      )
      const button = (text: string) =>
        [...host.querySelectorAll('button')].find((node) => node.textContent === text)!
      await act(async () => button('下一步').click())
      expect(host.querySelector('[data-template="paper"]')).toBeNull()
      expect(host.querySelector('[aria-label="文稿类型"]')).not.toBeNull()
      await act(async () => button('开始检查论文').click())
      expect(generate).toHaveBeenCalledOnce()
      expect(state.doc.textContent).toBe(segments[0]!.text)
      expect(onClose).not.toHaveBeenCalled()
      expect(host.textContent).toContain('检查完成')
      expect(host.textContent).toContain('请核对基线')
      await act(async () => button('继续：生成润色建议').click())
      expect(generate).toHaveBeenCalledTimes(2)
      expect(state.doc.textContent).toBe(segments[0]!.text)
      expect(host.textContent).toContain('润色建议已准备好')
      expect(host.textContent).toContain('调整主语')
      await act(async () => button('应用选中修改').click())
      expect(state.doc.textContent).toContain('The results')
      expect(onClose).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
