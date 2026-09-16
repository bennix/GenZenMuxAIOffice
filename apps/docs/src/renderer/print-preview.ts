/** Use the same fixed page snapshot as PDF export, never the zoomed editing canvas. */
export async function printPaginationPreview(): Promise<void> {
  const pages = [...document.querySelectorAll<HTMLElement>('.pv-page')]
  const first = pages[0]
  if (!first) throw new Error('No document pages to print.')
  const width = parseFloat(first.style.width)
  const height = parseFloat(first.style.height)
  if (![width, height].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('Invalid document paper size.')
  // A native print job has one paper size. Mixed paper remains available through PDF export.
  if (
    pages.some(
      (page) => parseFloat(page.style.width) !== width || parseFloat(page.style.height) !== height,
    )
  )
    throw new Error(
      '文档包含不同纸张尺寸，请先导出 PDF，再按各页尺寸打印。 / Export mixed paper sizes to PDF before printing.',
    )
  await document.fonts.ready
  await Promise.all(
    [...document.querySelectorAll<HTMLImageElement>('.pv-page img')].map((img) => img.decode()),
  )
  const result = await window.desktop.print(
    Math.round((width / 96) * 1440),
    Math.round((height / 96) * 1440),
  )
  if (!result.ok && result.error && !/cancel/i.test(result.error)) throw new Error(result.error)
}
