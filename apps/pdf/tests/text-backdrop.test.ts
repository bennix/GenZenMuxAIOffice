import { describe, expect, it } from 'vitest'
import { dominantBackdrop } from '../src/renderer/text-backdrop'

describe('dominantBackdrop', () => {
  it('keeps a colored PDF cell background despite antialiasing noise', () => {
    expect(
      dominantBackdrop([
        [31, 78, 121, 255],
        [32, 80, 120, 255],
        [30, 79, 122, 255],
        [247, 247, 247, 255],
      ]),
    ).toBe('rgb(31, 79, 122)')
  })

  it('ignores transparent pixels and returns undefined without a usable backdrop', () => {
    expect(
      dominantBackdrop([
        [255, 255, 255, 0],
        [0, 0, 0, 128],
      ]),
    ).toBeUndefined()
  })
})
