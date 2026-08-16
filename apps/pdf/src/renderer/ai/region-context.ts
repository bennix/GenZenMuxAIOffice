export interface PdfAiRegionContext {
  id: string
  pageNumber: number
  pageNumbers: number[]
  base64: string
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

export interface RegionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PageRegionBounds extends RegionRect {
  pageIndex: number
}

export interface PageRegionSlice {
  pageIndex: number
  rect: RegionRect
}

export interface RegionCaptureLayout {
  width: number
  height: number
  scale: number
  placements: Array<{ x: number; y: number; width: number; height: number }>
}

/** Normalize a drag in page-local CSS pixels and clamp it to the visible page. */
export function normalizeRegionRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pageWidth: number,
  pageHeight: number,
): RegionRect {
  const clampX = (value: number) => Math.min(Math.max(value, 0), Math.max(0, pageWidth))
  const clampY = (value: number) => Math.min(Math.max(value, 0), Math.max(0, pageHeight))
  const x1 = clampX(startX)
  const y1 = clampY(startY)
  const x2 = clampX(endX)
  const y2 = clampY(endY)
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Intersect one scroll-content drag rectangle with each page, preserving document order. */
export function splitSelectionAcrossPages(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pages: PageRegionBounds[],
): PageRegionSlice[] {
  const selectionLeft = Math.min(startX, endX)
  const selectionTop = Math.min(startY, endY)
  const selectionRight = Math.max(startX, endX)
  const selectionBottom = Math.max(startY, endY)
  const slices: PageRegionSlice[] = []
  for (const page of pages) {
    const left = Math.max(selectionLeft, page.left)
    const top = Math.max(selectionTop, page.top)
    const right = Math.min(selectionRight, page.left + page.width)
    const bottom = Math.min(selectionBottom, page.top + page.height)
    if (right <= left || bottom <= top) continue
    slices.push({
      pageIndex: page.pageIndex,
      rect: {
        left: left - page.left,
        top: top - page.top,
        width: right - left,
        height: bottom - top,
      },
    })
  }
  return slices
}

/** Fit page crops into one vertically stitched image without changing their aspect ratios. */
export function layoutRegionCaptures(
  sizes: Array<{ width: number; height: number }>,
  maxSide = 2048,
  gap = 12,
): RegionCaptureLayout {
  if (sizes.length === 0) return { width: 0, height: 0, scale: 1, placements: [] }
  const rawWidth = Math.max(...sizes.map((size) => size.width))
  const rawHeight =
    sizes.reduce((sum, size) => sum + size.height, 0) + gap * Math.max(0, sizes.length - 1)
  const scale = Math.min(1, maxSide / Math.max(rawWidth, rawHeight))
  const width = Math.max(1, Math.round(rawWidth * scale))
  const height = Math.max(1, Math.round(rawHeight * scale))
  let rawY = 0
  const placements = sizes.map((size) => {
    const itemWidth = Math.max(1, Math.round(size.width * scale))
    const itemHeight = Math.max(1, Math.round(size.height * scale))
    const placement = {
      x: Math.round((width - itemWidth) / 2),
      y: Math.round(rawY * scale),
      width: itemWidth,
      height: itemHeight,
    }
    rawY += size.height + gap
    return placement
  })
  return { width, height, scale, placements }
}
