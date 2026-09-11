import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageEditorModal from './ImageEditorModal'
import { useCanvas } from '../store/canvasStore'
import { useEditor } from '../store/editorStore'
import { useSettings } from '../store/settingsStore'
import { blobForCard, editCard } from '../services/edits'
import { photoEnhancements } from '../data/photoEnhancements'

vi.mock('../services/edits', () => ({ blobForCard: vi.fn(), editCard: vi.fn() }))

describe('photography enhancements', () => {
  beforeEach(() => {
    useSettings.setState({ lang: 'zh' })
    useCanvas.setState({
      cards: [
        {
          id: 'photo',
          projectId: 'p',
          type: 'image',
          status: 'ready',
          url: 'image.png',
          x: 0,
          y: 0,
          w: 320,
          h: 320,
        },
      ],
    })
    useEditor.getState().open('photo')
    vi.mocked(blobForCard).mockResolvedValue(new Blob(['image']))
    vi.mocked(editCard).mockResolvedValue()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:photo')
        static revokeObjectURL = vi.fn()
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useEditor.getState().close()
  })

  it.each(photoEnhancements)(
    'submits $id as a whole-image edit with editable instructions',
    async (preset) => {
      render(<ImageEditorModal />)
      fireEvent.click(screen.getByRole('button', { name: '摄影增强' }))
      fireEvent.click(screen.getByRole('button', { name: new RegExp(preset.zh.name) }))
      const prompt = screen.getByRole('textbox')
      expect((prompt as HTMLTextAreaElement).value).toContain(preset.zh.prompt)
      fireEvent.change(prompt, { target: { value: preset.zh.prompt + '\n保留更多阴影。' } })
      await waitFor(() => expect(screen.getByRole('button', { name: '应用' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: '应用' }))
      await waitFor(() =>
        expect(editCard).toHaveBeenCalledWith(
          'p',
          expect.objectContaining({ id: 'photo' }),
          preset.zh.prompt + '\n保留更多阴影。',
          undefined,
        ),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    },
  )

  it('clears preset and prompt when reopening an image', async () => {
    render(<ImageEditorModal />)
    fireEvent.click(screen.getByRole('button', { name: '摄影增强' }))
    fireEvent.click(screen.getByRole('button', { name: /复古胶片/ }))
    act(() => useEditor.getState().close())
    act(() => useEditor.getState().open('photo'))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: '局部重绘' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(blobForCard).toHaveBeenCalled())
  })

  it('shows a load error and prevents submitting without the original', async () => {
    vi.mocked(blobForCard).mockRejectedValue(new Error('unavailable'))
    render(<ImageEditorModal />)
    fireEvent.click(screen.getByRole('button', { name: '摄影增强' }))
    fireEvent.click(screen.getByRole('button', { name: /高级人像/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('原图加载失败')
    expect(screen.getByRole('button', { name: '应用' })).toBeDisabled()
  })
})
