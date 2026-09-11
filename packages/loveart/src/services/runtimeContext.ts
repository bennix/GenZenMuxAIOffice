import type { Lang } from '../store/settingsStore'

export function currentRuntimeDateContext(lang: Lang, now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const date = `${year}-${month}-${day}`

  return lang === 'zh'
    ? `当前日期: ${date}。当前年份: ${year}。图像、视频、脚注、海报小字和 Agent 输出都必须按当前运行系统日期为准；不要生成过去年份或过期时间标记，除非用户明确要求。`
    : `Current runtime date: ${date}. Current year: ${year}. Image, video, footer text, poster microcopy, and Agent output must follow the current system runtime date; Do not generate stale past-year or outdated time markers unless the user explicitly asks for them.`
}
