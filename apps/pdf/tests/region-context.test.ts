import { describe, expect, it } from 'vitest'
import {
  layoutRegionCaptures,
  normalizeRegionRect,
  splitSelectionAcrossPages,
} from '../src/renderer/ai/region-context'

describe('PDF AI page-region selection', () => {
  it('normalizes a reverse drag into a positive rectangle', () => {
    expect(normalizeRegionRect(90, 80, 10, 20, 100, 100)).toEqual({
      left: 10,
      top: 20,
      width: 80,
      height: 60,
    })
  })

  it('clamps both drag ends to the page bounds', () => {
    expect(normalizeRegionRect(-20, 10, 140, 120, 100, 80)).toEqual({
      left: 0,
      top: 10,
      width: 100,
      height: 70,
    })
  })

  it('preserves a click as a zero-area selection for rejection by the UI', () => {
    expect(normalizeRegionRect(30, 40, 30, 40, 100, 100)).toEqual({
      left: 30,
      top: 40,
      width: 0,
      height: 0,
    })
  })

  it('splits a drag across consecutive pages and ignores the page gap', () => {
    const pages = [
      { pageIndex: 0, left: 50, top: 0, width: 100, height: 100 },
      { pageIndex: 1, left: 50, top: 120, width: 100, height: 100 },
      { pageIndex: 2, left: 50, top: 240, width: 100, height: 100 },
    ]

    expect(splitSelectionAcrossPages(70, 60, 130, 300, pages)).toEqual([
      { pageIndex: 0, rect: { left: 20, top: 60, width: 60, height: 40 } },
      { pageIndex: 1, rect: { left: 20, top: 0, width: 60, height: 100 } },
      { pageIndex: 2, rect: { left: 20, top: 0, width: 60, height: 60 } },
    ])
  })

  it('keeps page order when the cross-page drag runs backwards', () => {
    const pages = [
      { pageIndex: 4, left: 20, top: 0, width: 120, height: 100 },
      { pageIndex: 5, left: 20, top: 116, width: 120, height: 100 },
    ]

    expect(
      splitSelectionAcrossPages(110, 180, 50, 40, pages).map((slice) => slice.pageIndex),
    ).toEqual([4, 5])
  })

  it('lays cropped pages out as one bounded image in source order', () => {
    expect(
      layoutRegionCaptures(
        [
          { width: 120, height: 80 },
          { width: 100, height: 160 },
        ],
        200,
        10,
      ),
    ).toEqual({
      width: 96,
      height: 200,
      scale: 0.8,
      placements: [
        { x: 0, y: 0, width: 96, height: 64 },
        { x: 8, y: 72, width: 80, height: 128 },
      ],
    })
  })
})
