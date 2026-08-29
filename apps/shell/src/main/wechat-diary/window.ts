/** 3-day WeChat diary windows in Asia/Shanghai, with a 4:00 logical-day rollover. */

export interface CivilDate {
  year: number
  month: number
  day: number
}

export interface DiaryWindow {
  start: CivilDate
  end: CivilDate
  startIso: string
  endIso: string
  year: string
  fileName: string
}

const SHANGHAI = 'Asia/Shanghai'
const EPOCH: CivilDate = { year: 2020, month: 1, day: 1 }

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function isoDate(d: CivilDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`
}

export function addDays(d: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(d.year, d.month - 1, d.day + days))
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

export function dayOrdinal(d: CivilDate): number {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000)
}

export function shanghaiParts(
  nowMs: number,
  timeZone = SHANGHAI,
): CivilDate & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs))
  const num = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
    minute: num('minute'),
  }
}

export function formatHm(nowMs: number, timeZone = SHANGHAI): string {
  const { hour, minute } = shanghaiParts(nowMs, timeZone)
  return `${pad2(hour)}:${pad2(minute)}`
}

/** Civil date after shifting back when still before the logical day start (default 04:00). */
export function logicalCivilDate(nowMs: number, dayStartHour = 4, timeZone = SHANGHAI): CivilDate {
  const p = shanghaiParts(nowMs, timeZone)
  const today = { year: p.year, month: p.month, day: p.day }
  return p.hour < dayStartHour ? addDays(today, -1) : today
}

export function threeDayWindow(
  nowMs: number,
  opts?: { dayStartHour?: number; windowDays?: number; timeZone?: string },
): DiaryWindow {
  const dayStartHour = opts?.dayStartHour ?? 4
  const windowDays = opts?.windowDays ?? 3
  const timeZone = opts?.timeZone ?? SHANGHAI
  const logical = logicalCivilDate(nowMs, dayStartHour, timeZone)
  const offset = dayOrdinal(logical) - dayOrdinal(EPOCH)
  const startOffset = Math.floor(offset / windowDays) * windowDays
  const start = addDays(EPOCH, startOffset)
  const end = addDays(start, windowDays - 1)
  return {
    start,
    end,
    startIso: isoDate(start),
    endIso: isoDate(end),
    year: String(start.year),
    fileName: `${isoDate(start)}~${pad2(end.month)}-${pad2(end.day)}.md`,
  }
}

export function diaryRelativePath(win: DiaryWindow): string {
  return `${win.year}/${win.fileName}`
}
