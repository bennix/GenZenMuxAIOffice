import { describe, expect, it } from 'vitest'
import {
  applyFileMention,
  atMentionQuery,
  filterOpenFiles,
  type OpenFileRef,
} from '../src/open-files'

const files: OpenFileRef[] = [
  {
    id: '1',
    kind: 'docs',
    title: '计划.docx',
    filePath: '/tmp/计划.docx',
    active: true,
  },
  {
    id: '2',
    kind: 'slides',
    title: '路演.pptx',
    filePath: '/tmp/路演.pptx',
    active: false,
  },
]

describe('atMentionQuery', () => {
  it('detects @ at the start and after whitespace or brackets', () => {
    expect(atMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(atMentionQuery('参考 @路', 5)).toEqual({ start: 3, query: '路' })
    expect(atMentionQuery('(@计划', 4)).toEqual({ start: 1, query: '计划' })
  })

  it('ignores emails and the @connect command', () => {
    expect(atMentionQuery('a@b.com', 4)).toBeNull()
    expect(atMentionQuery('@connect', 8)).toBeNull()
    expect(atMentionQuery('see @Connect now', 12)).toBeNull()
  })
})

describe('filterOpenFiles', () => {
  it('hides the active file and filters by title', () => {
    expect(filterOpenFiles(files, '').map((file) => file.id)).toEqual(['2'])
    expect(filterOpenFiles(files, '路演').map((file) => file.title)).toEqual(['路演.pptx'])
    expect(filterOpenFiles(files, 'xlsx')).toEqual([])
  })
})

describe('applyFileMention', () => {
  it('replaces the @query with a titled mention', () => {
    expect(applyFileMention('参考 @路', 5, 3, '路演.pptx')).toEqual({
      text: '参考 @路演.pptx ',
      cursor: 12,
    })
  })
})
