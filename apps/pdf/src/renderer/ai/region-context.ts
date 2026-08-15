export interface PdfAiRegionContext {
  id: string
  pageNumber: number
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
