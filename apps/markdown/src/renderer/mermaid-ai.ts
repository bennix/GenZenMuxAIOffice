import type { AiSettings } from '@genoffice/ai-provider'
import { EDITORIAL_SYSTEM } from './diagram-design'
import { writePrettyTheme } from './mermaid-themes'

const PRETTY_SYSTEM = `You are a Mermaid diagram source editor inside GenOffice Markdown, following Pretty Mermaid (imxv/Pretty-mermaid-skills).
Return only valid Mermaid source, without Markdown fences, explanations, or surrounding prose.
Preserve the user's language in visible labels. Prefer readable layouts and concise labels.
Keep a leading "%% pretty-theme: <id>" comment when one is present; otherwise add "%% pretty-theme: zinc-light".
Supported types: flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, xychart-beta.
For xychart-beta, quote every non-ASCII title and category: title "本周完成量" and x-axis ["周一", "周二"]. Always include bar or line data.
Never use HTML, click handlers, external links, JavaScript, or init directives other than the pretty-theme comment.
When existing source is supplied, modify it according to the request instead of replacing unrelated content.`

export type MermaidStudioMode = 'pretty' | 'editorial'

export function cleanMermaidSource(value: string): string {
  let source = value.trim()
  const fenced = source.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i)
  if (fenced) source = fenced[1]!.trim()
  source = source.replace(/^\s*(?:Mermaid source|Mermaid code|源码)\s*:\s*/i, '')
  return source.trim()
}

export async function generateMermaidWithZenMux(args: {
  instruction: string
  currentSource?: string
  mode?: MermaidStudioMode
  themeId?: string
}): Promise<string> {
  const settings: AiSettings = await window.markdownApi.getAiSettings()
  const zenmux = settings.providers.zenmux
  if (!zenmux?.apiKey) throw new Error('请先在设置中填写 API Key')

  const mode = args.mode ?? 'pretty'
  const current = args.currentSource?.trim()
  const response = await window.markdownApi.aiChat({
    settings: { ...settings, provider: 'zenmux' },
    system: mode === 'editorial' ? EDITORIAL_SYSTEM : PRETTY_SYSTEM,
    user: current
      ? `Modify this Mermaid source according to the instruction.\n\nINSTRUCTION:\n${args.instruction}\n\nCURRENT SOURCE:\n${current}`
      : `Create a Mermaid diagram for this instruction:\n\n${args.instruction}`,
  })
  if (!response.ok) throw new Error(response.error || 'ZenMux Mermaid request failed')
  let source = cleanMermaidSource(response.content ?? '')
  if (!source) throw new Error('ZenMux 没有返回 Mermaid 源码')
  if (args.themeId) source = writePrettyTheme(source, args.themeId)
  return source
}
