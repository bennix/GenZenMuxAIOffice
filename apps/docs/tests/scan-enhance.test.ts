import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AiScanEnhanceDialog } from '../src/renderer/components/PictureDialogs'

let root: Root | undefined
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('scan enhancement', () => {
  it('displays the configured model, refreshes it for generation, and clears obsolete results', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    let model = 'google/test-image'
    const generateImage = vi.fn().mockResolvedValue({ base64: 'Yg==', mime: 'image/png' })
    const onApply = vi.fn()
    window.desktop = {
      getAiSettings: vi.fn(async () => ({ providers: { zenmux: { imageModel: model } } })),
      generateImage,
    } as unknown as typeof window.desktop
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(
        createElement(AiScanEnhanceDialog, {
          dataUrl: 'data:image/png;base64,YQ==',
          onApply,
          onCancel: vi.fn(),
        }),
      ),
    )
    expect(container.textContent).toContain('google/test-image')
    const source = container.querySelector('img')!
    source.decode = vi.fn().mockResolvedValue(undefined)
    Object.defineProperties(source, { naturalWidth: { value: 210 }, naturalHeight: { value: 297 } })
    const button = (text: string) =>
      [...container.querySelectorAll('button')].find((b) => b.textContent === text)!
    act(() => button('模糊文稿清晰化').click())
    model = 'openai/user-selected-image'
    await act(async () => button('生成预览').click())
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model, referenceImages: [{ mime: 'image/png', base64: 'YQ==' }] }),
    )
    const request = generateImage.mock.calls[0]![0]
    expect(request.prompt).toContain('never complete a word, digit, formula')
    expect(request.prompt).toContain('red seals')
    expect(container.textContent).toContain(model)
    expect(onApply).not.toHaveBeenCalled()
    expect(button('应用到文档').disabled).toBe(false)
    act(() => button('黑白扫描件增强').click())
    expect(button('应用到文档').disabled).toBe(true)
    model = ''
    await act(async () => button('生成预览').click())
    expect(generateImage).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('请先在 AI 设置中选择图像模型')
  })
})
