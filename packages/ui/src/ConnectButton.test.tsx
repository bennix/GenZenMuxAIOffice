import { describe, expect, it } from 'vitest'
import { connectMenuPosition } from './ConnectButton'

describe('connectMenuPosition', () => {
  it('keeps the target list inside the left edge of a narrow window', () => {
    const position = connectMenuPosition({ left: 5, right: 29, top: 400, bottom: 424 }, 360, 600)
    expect(position.left).toBe(8)
    expect(position.top).toBeLessThan(400)
  })

  it('opens below when there is no useful room above', () => {
    const position = connectMenuPosition({ left: 300, right: 324, top: 20, bottom: 44 }, 360, 600)
    expect(position.left).toBe(94)
    expect(position.top).toBe(50)
  })
})
