import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GptImagePromptWizard from './GptImagePromptWizard'
import { useSettings } from '../store/settingsStore'
import { searchPromptSources } from '../services/promptResearch'
vi.mock('../services/promptResearch', () => ({
  searchPromptSources: vi.fn(),
  suggestPromptDetails: vi.fn(),
}))

afterEach(cleanup)
it('filters templates, collects requirements, edits preview and applies without generation', () => {
  useSettings.setState({
    models: [{ id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true }],
  })
  const apply = vi.fn()
  render(<GptImagePromptWizard initialBrief="" busy={false} onApply={apply} />)
  fireEvent.click(screen.getByRole('button', { name: '商品与电商' }))
  fireEvent.click(screen.getByRole('button', { name: /填写需求/ }))
  expect(screen.getByRole('button', { name: /预览提示词/ })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('主体与用途（必填）'), {
    target: { value: '咖啡新品主视觉' },
  })
  fireEvent.click(screen.getByRole('button', { name: /预览提示词/ }))
  expect((screen.getByLabelText('提示词预览（可编辑）') as HTMLTextAreaElement).value).toContain(
    '咖啡新品主视觉',
  )
  fireEvent.change(screen.getByLabelText('提示词预览（可编辑）'), {
    target: { value: '我最终确认的提示词' },
  })
  fireEvent.click(screen.getByRole('button', { name: '应用到主页' }))
  expect(apply).toHaveBeenCalledWith('我最终确认的提示词', 'openai/gpt-image-2')
})

it('shows an empty search state', () => {
  render(<GptImagePromptWizard initialBrief="" busy={false} onApply={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('搜索提示词模板'), {
    target: { value: 'no-such-template-xyz' },
  })
  expect(screen.getByRole('status')).toHaveTextContent('没有匹配模板')
})

it('applies selected search results to preview and submits edited excerpts with sources', async () => {
  useSettings.setState({
    models: [{ id: 'openai/gpt-image-2', name: 'GPT Image 2', category: 'image', isDefault: true }],
  })
  const coffee = {
    id: 'coffee',
    title: '咖啡文化',
    summary: '咖啡馆提供交流空间',
    provider: 'Wikipedia',
    url: 'https://example.com/coffee',
  }
  const unrelated = {
    id: 'other',
    title: '其他主题',
    summary: '不应该加入的内容',
    provider: 'DuckDuckGo',
    url: 'https://example.com/other',
  }
  vi.mocked(searchPromptSources).mockResolvedValue({ sources: [coffee, unrelated], warnings: [] })
  const apply = vi.fn()
  render(<GptImagePromptWizard initialBrief="咖啡主题海报" busy={false} onApply={apply} />)
  fireEvent.click(screen.getByRole('button', { name: /填写需求/ }))
  fireEvent.click(screen.getByText('✦ 联网补充灵感与空白项'))
  fireEvent.click(screen.getByRole('button', { name: '免费检索公开资料' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: '其他主题' }))
  fireEvent.click(screen.getByRole('button', { name: '应用选中 1 条资料到提示词 →' }))
  expect(screen.getByLabelText('已应用的联网资料')).toBeInTheDocument()
  expect(apply).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('采用内容 · 咖啡文化'), {
    target: { value: '突出交流空间和温暖氛围' },
  })
  fireEvent.click(screen.getByRole('button', { name: '应用到主页' }))
  expect(apply).toHaveBeenCalledWith(
    expect.stringContaining('突出交流空间和温暖氛围'),
    'openai/gpt-image-2',
  )
  expect(apply.mock.calls[0][0]).toContain(coffee.url)
  expect(apply.mock.calls[0][0]).not.toContain(unrelated.url)
  fireEvent.click(screen.getByRole('button', { name: '移除资料 咖啡文化' }))
  fireEvent.click(screen.getByRole('button', { name: '应用到主页' }))
  expect(apply.mock.calls[1][0]).not.toContain(coffee.url)
})
