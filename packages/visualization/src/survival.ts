/** Right-censored Kaplan–Meier: events precede censor removals at tied times. */
export function kaplanMeier(times: readonly number[], events: readonly number[]) {
  if (!times.length || times.length !== events.length)
    throw new Error('生存分析需要一一对应的时间和事件状态。')
  if (times.some((time) => !Number.isFinite(time) || time < 0))
    throw new Error('观测时间必须为有限非负数。')
  if (events.some((event) => event !== 0 && event !== 1))
    throw new Error('事件状态必须为 0（删失）或 1（事件发生）。')
  const observations = times
    .map((time, i) => ({ time, event: events[i]! }))
    .sort((a, b) => a.time - b.time)
  const points: [number, number][] = [[0, 1]]
  const censored: [number, number, number][] = []
  const riskTable: {
    time: number
    atRisk: number
    events: number
    censored: number
    survival: number
  }[] = []
  let atRisk = times.length,
    survival = 1,
    index = 0
  while (index < observations.length) {
    const time = observations[index]!.time
    let deaths = 0,
      withdrawals = 0
    do {
      if (observations[index]!.event) deaths++
      else withdrawals++
      index++
    } while (index < observations.length && observations[index]!.time === time)
    survival *= 1 - deaths / atRisk
    points.push([time, survival])
    if (withdrawals) censored.push([time, survival, withdrawals])
    riskTable.push({ time, atRisk, events: deaths, censored: withdrawals, survival })
    atRisk -= deaths + withdrawals
  }
  return { points, censored, riskTable }
}
