export type DiaryCommand =
  | { kind: 'help' }
  | { kind: 'ping' }
  | { kind: 'withdraw' }
  | { kind: 'seal' }
  | { kind: 'note'; text: string }
  | { kind: 'chat'; text: string }

const HELP_EXACT = /^(帮助|幫忙|help)$/iu
const PING = /^(在吗|在嗎|你好吗|你好嗎|hello|hi)$/iu
const NOTE = /^记[:：]\s*([\s\S]+)$/u

export function classifyWechatText(raw: string): DiaryCommand {
  const text = raw.replace(/^\s+|\s+$/u, '')
  if (!text) return { kind: 'chat', text: '' }
  if (HELP_EXACT.test(text)) return { kind: 'help' }
  if (PING.test(text)) return { kind: 'ping' }
  if (/^(?:撤回|撤銷|undo)$/iu.test(text)) return { kind: 'withdraw' }
  if (text.length <= 24 && /(?:结束|結束|晚安|今天就到这|今天就到這)/u.test(text)) {
    return { kind: 'seal' }
  }
  const note = text.match(NOTE)
  if (note?.[1]?.trim()) return { kind: 'note', text: note[1].trim() }
  return { kind: 'chat', text }
}

export const HELP_TEXT = `微信日记用法：
· 直接发文字：记入当前三天窗口，并由系统 AI 回复（回复也写入同一篇）
· 单独发图片：图片立即保存到日记；不逐张打断，累计 5 张后统一分析
· 图片后发问题：不足 5 张也会把当前图片与问题一起交给 AI
· 发送 PDF 附件：自动保存到本地；随后按应用 UI 的列表询问稿件/标书类型、审稿级别及中英文，再通过 ZenMux 执行“分段证据提取 + 3 名委员独立评审 + 1 名主席综合”的多轮严格审稿
· 记：内容 — 只入库，不调用 AI
· 撤回 — 删掉上一条微信记录及紧随其后的 AI 回复
· 结束 / 晚安 — 给本窗口写一条封存注脚
· 帮助 — 显示本说明
· 在吗 — 探活，不写入笔记`

export const PING_TEXT =
  '在的。发给我的内容会记进当前三天窗口的 Markdown，并走你在设置里指定的 AI。'
export const SAVED_TEXT = '已记下。'
export const WITHDRAWN_TEXT = '已撤回上一条。'
export const NOTHING_TO_WITHDRAW = '没有可撤回的记录。'
export const SEALED_TEXT = '本窗口已封存。之后发来的内容仍会继续追加。'
