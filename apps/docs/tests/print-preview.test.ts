import { afterEach, describe, expect, it, vi } from 'vitest'
import { printPaginationPreview } from '../src/renderer/print-preview'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
describe('physical document printing', () => {
  it('uses the unscaled page dimensions and waits for images', async () => {
    document.body.innerHTML =
      '<div class="doc-zoom" style="zoom:0.67"></div><div class="pv-page" style="width:793.7px;height:1122.53px"><img></div>'
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
    let decoded = false
    document.querySelector('img')!.decode = async () => {
      decoded = true
    }
    const print = vi.fn(async () => {
      expect(decoded).toBe(true)
      return { ok: true }
    })
    window.desktop = { print } as unknown as typeof window.desktop
    await printPaginationPreview()
    expect(print).toHaveBeenCalledWith(11906, 16838)
    expect(document.querySelector<HTMLElement>('.doc-zoom')!.style.zoom).toBe('0.67')
  })
  it('rejects missing or mixed page boxes rather than silently scaling them', async () => {
    await expect(printPaginationPreview()).rejects.toThrow('No document pages')
    document.body.innerHTML =
      '<div class="pv-page" style="width:794px;height:1123px"></div><div class="pv-page" style="width:1123px;height:794px"></div>'
    await expect(printPaginationPreview()).rejects.toThrow('不同纸张尺寸')
  })
})
