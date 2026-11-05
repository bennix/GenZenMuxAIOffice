import { expect, it } from 'vitest'
import { liveDraftPreview } from '../src/renderer/ai/live-draft'
it('shows incremental plain text and bounds retained preview', () => {
  expect(liveDraftPreview('第一章\nPython 入门')).toContain('Python 入门')
  expect(liveDraftPreview('a'.repeat(3000))).toHaveLength(1200)
})
it('shows slide copy without exposing style/script markup, even mid-chunk', () => {
  expect(liveDraftPreview('<html><head><style>body { color:')).toBe('')
  expect(liveDraftPreview('<html><body><div>列表索引</div><script>secret()')).toBe('列表索引')
  expect(liveDraftPreview('<html><body><div>切片示例</div><div class="par')).toBe('切片示例')
})
