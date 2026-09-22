import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PromptResearchPanel from './PromptResearchPanel'
import { searchPromptSources, suggestPromptDetails } from '../services/promptResearch'
import { useSettings } from '../store/settingsStore'

vi.mock('../services/promptResearch', () => ({
  searchPromptSources: vi.fn(),
  suggestPromptDetails: vi.fn(),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const source = {
  id: 'wiki-1',
  title: 'Coffee',
  summary: 'Coffee culture',
  url: 'https://en.wikipedia.org/wiki/Coffee',
  provider: 'Wikipedia',
}
it('searches without an API key and lets users add a source without calling AI', async () => {
  useSettings.setState({ apiKey: '' })
  vi.mocked(searchPromptSources).mockResolvedValue({ sources: [source], warnings: [] })
  const add = vi.fn()
  render(
    <PromptResearchPanel
      brief="coffee"
      template="poster"
      fields={[]}
      values={{}}
      constraints=""
      onAccept={vi.fn()}
      onSource={add}
    />,
  )
  fireEvent.click(screen.getByText('✦ 联网补充灵感与空白项'))
  fireEvent.click(screen.getByRole('button', { name: '免费检索公开资料' }))
  fireEvent.click(await screen.findByRole('button', { name: '应用这条到提示词' }))
  expect(add).toHaveBeenCalledWith(source)
  expect(suggestPromptDetails).not.toHaveBeenCalled()
})

it('does not apply AI suggestions until the user chooses one', async () => {
  useSettings.setState({
    apiKey: 'test',
    models: [{ id: 'chat', name: 'Chat', category: 'chat', isDefault: true }],
  })
  vi.mocked(searchPromptSources).mockResolvedValue({ sources: [source], warnings: [] })
  const suggestion = {
    fieldKey: 'color',
    value: '暖棕色',
    reason: '咖啡氛围',
    kind: 'creative' as const,
    sourceIds: ['wiki-1'],
  }
  vi.mocked(suggestPromptDetails).mockResolvedValue([suggestion])
  const accept = vi.fn()
  render(
    <PromptResearchPanel
      brief="coffee"
      template="poster"
      fields={[{ key: 'color', label: 'Color' }]}
      values={{}}
      constraints=""
      onAccept={accept}
      onSource={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('✦ 联网补充灵感与空白项'))
  fireEvent.click(screen.getByRole('button', { name: '免费检索公开资料' }))
  fireEvent.click(await screen.findByRole('button', { name: 'AI 建议空白项与遗漏细节' }))
  await waitFor(() => expect(screen.getByText('暖棕色')).toBeInTheDocument())
  expect(accept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '采用建议' }))
  expect(accept).toHaveBeenCalledWith(suggestion, [source])
})
