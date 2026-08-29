import { describe, expect, it } from 'vitest'
import { addDays, isoDate, logicalCivilDate, threeDayWindow } from '../src/main/wechat-diary/window'

describe('three-day diary window', () => {
  it('rolls back before 04:00 Shanghai', () => {
    // 2026-08-29 03:10 +08 = 2026-08-28 19:10 UTC
    const ms = Date.parse('2026-08-28T19:10:00.000Z')
    expect(isoDate(logicalCivilDate(ms))).toBe('2026-08-28')
  })

  it('keeps the calendar day at/after 04:00', () => {
    const ms = Date.parse('2026-08-28T20:10:00.000Z') // 04:10 +08 on 29th
    expect(isoDate(logicalCivilDate(ms))).toBe('2026-08-29')
  })

  it('groups three consecutive logical days into one file', () => {
    // 2020-01-01 is the epoch (day 0 of a window)
    const a = threeDayWindow(Date.parse('2020-01-01T04:00:00+08:00'))
    expect(a.startIso).toBe('2020-01-01')
    expect(a.endIso).toBe('2020-01-03')
    expect(a.fileName).toBe('2020-01-01~01-03.md')

    const b = threeDayWindow(Date.parse('2020-01-03T10:00:00+08:00'))
    expect(b.fileName).toBe('2020-01-01~01-03.md')

    const c = threeDayWindow(Date.parse('2020-01-04T10:00:00+08:00'))
    expect(c.startIso).toBe('2020-01-04')
    expect(c.endIso).toBe('2020-01-06')
    expect(c.fileName).toBe('2020-01-04~01-06.md')
  })

  it('crosses month and year on the window end', () => {
    const win = threeDayWindow(Date.parse('2026-12-31T12:00:00+08:00'))
    expect(win.startIso <= '2026-12-31').toBe(true)
    expect(addDays(win.start, 2)).toEqual(win.end)
    expect(win.fileName.endsWith('.md')).toBe(true)
  })
})
