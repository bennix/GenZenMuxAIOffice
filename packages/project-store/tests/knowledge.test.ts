import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../src/store.js'
import { appendLocalMemoryContext } from '../src/knowledge-context.js'

describe('local personal knowledge base', () => {
  let root: string
  let store: ProjectStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'genoffice-knowledge-'))
    store = new ProjectStore(root)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function remember(question: string, answer: string, chatId = 'chat-1'): void {
    store.appendChatMessage('default', chatId, { role: 'user', text: question })
    store.appendChatMessage('default', chatId, { role: 'assistant', text: answer })
  }

  it('automatically captures a completed question and answer', () => {
    remember('如何渲染柯西不等式？', '使用 LaTeX 和 KaTeX 渲染。')
    const memories = store.listKnowledge()
    expect(memories).toHaveLength(1)
    expect(memories[0].question).toContain('柯西')
    expect(memories[0].answer).toContain('KaTeX')
  })

  it('does not capture an empty assistant reply or a lone user message', () => {
    store.appendChatMessage('default', 'empty', { role: 'user', text: 'question' })
    store.appendChatMessage('default', 'empty', { role: 'assistant', text: '   ' })
    store.appendChatMessage('default', 'pending', { role: 'user', text: 'unfinished' })
    expect(store.listKnowledge()).toHaveLength(0)
  })

  it('supports Chinese and English retrieval and limits results', () => {
    remember('如何编辑化学表达式？', '支持 mhchem 化学方程式渲染。', 'chem')
    remember('How should SQL joins work?', 'Use a read-only local database.', 'sql')
    remember('SQL schema design', 'Define primary and foreign keys.', 'schema')
    expect(store.searchKnowledge('化学方程式')[0].memory.chatId).toBe('chem')
    const sql = store.searchKnowledge('SQL database', { limit: 1 })
    expect(sql).toHaveLength(1)
    expect(sql[0].matchedTerms).toContain('sql')
  })

  it('boosts memories from the current project and source file', () => {
    const path = '/tmp/current-paper.docx'
    const ids = store.resolveChatForFile(path)
    remember('论文审稿方法', '当前论文使用三委员审稿。', ids.chatId)
    remember('论文审稿方法', '其他项目的普通审稿。', 'other')
    const result = store.searchKnowledge('论文审稿', { projectId: ids.projectId, sourceFile: path })
    expect(result[0].memory.sourceFile).toBe(path)
  })

  it('keeps memory provenance when an unsaved chat is saved or a file is renamed', () => {
    remember('draft question', 'draft answer', 'unsaved-draft')
    const savedPath = '/tmp/saved-paper.docx'
    const ids = store.rebindChatToFile('default', 'unsaved-draft', savedPath)
    expect(store.listKnowledge()[0]).toMatchObject({
      projectId: ids.projectId,
      chatId: ids.chatId,
      sourceFile: savedPath,
    })
    const renamedPath = '/tmp/renamed-paper.docx'
    store.fileRenamed(savedPath, renamedPath)
    expect(store.listKnowledge()[0].sourceFile).toBe(renamedPath)
  })

  it('honors capture and retrieval switches', () => {
    store.setKnowledgeSettings({ autoCapture: false })
    remember('private question', 'private answer')
    expect(store.listKnowledge()).toHaveLength(0)
    store.setKnowledgeSettings({ autoCapture: true })
    remember('stored question', 'stored answer')
    store.setKnowledgeSettings({ useForReplies: false })
    expect(store.searchKnowledge('stored')).toEqual([])
  })

  it('deletes individual entries and clears all entries', () => {
    remember('first memory', 'first answer', 'one')
    remember('second memory', 'second answer', 'two')
    const [first] = store.listKnowledge()
    store.deleteKnowledge(first.id)
    expect(store.listKnowledge()).toHaveLength(1)
    store.clearKnowledge()
    expect(store.listKnowledge()).toHaveLength(0)
  })

  it('skips damaged JSONL lines and truncates oversized answers', () => {
    remember('long answer', 'x'.repeat(30_000))
    appendFileSync(join(root, 'knowledge', 'memories.jsonl'), '{bad json\n', 'utf8')
    const memories = store.listKnowledge()
    expect(memories).toHaveLength(1)
    expect(memories[0].answer.length).toBe(24_000)
  })

  it('does not duplicate a persisted memory after reopening the store', () => {
    remember('stable question', 'stable answer')
    remember('stable question', 'stable answer')
    const before = readFileSync(join(root, 'knowledge', 'memories.jsonl'), 'utf8')
    const reopened = new ProjectStore(root)
    expect(reopened.listKnowledge()).toHaveLength(1)
    expect(readFileSync(join(root, 'knowledge', 'memories.jsonl'), 'utf8')).toBe(before)
  })

  it('adds bounded and clearly labelled memory context without changing the visible question', () => {
    remember('用户偏好什么引用格式？', '用户偏好 GB/T 7714。')
    const results = store.searchKnowledge('引用格式')
    const instruction = appendLocalMemoryContext('请整理参考文献', results)
    expect(instruction).toContain('请整理参考文献')
    expect(instruction).toContain('<local_memory_reference>')
    expect(instruction).toContain('可能过时或有误')
    expect(instruction.length).toBeLessThan(9_000)
  })
})
