import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { Editor } from '@tiptap/core'
import { AiReviewCommitteeModal } from '../src/renderer/components/AiReviewCommitteeModal'

vi.mock('@genoffice/ui', () => ({
  Markdown: () => null,
  ReviewRoleModels: () => createElement('div', { 'data-testid': 'models' }, '各角色模型'),
}))
it('shows review templates before optional settings and never starts a review on Next', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        createElement(AiReviewCommitteeModal, {
          editor: {} as Editor,
          settings: defaultAiSettings(),
          onClose: vi.fn(),
        }),
      ),
    )
    expect(host.querySelector('[aria-label="选择评审模板"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="models"]')).toBeNull()
    const button = (name: string) =>
      [...host.querySelectorAll('button')].find((node) => node.textContent === name)!
    await act(async () => button('下一步').click())
    expect(host.querySelector('[aria-label="选择评审模板"]')).toBeNull()
    expect(host.querySelector('details')?.open).toBe(false)
    expect(host.querySelector('[data-testid="models"]')).not.toBeNull()
    expect(button('开始严格审稿').disabled).toBe(true)
    await act(async () => button('上一步').click())
    expect(host.querySelector('[aria-label="选择评审模板"]')).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
