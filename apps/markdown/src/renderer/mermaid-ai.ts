import type { AiSettings } from '@genoffice/ai-provider'

const MERMAID_SYSTEM = `You are a Mermaid diagram source editor inside GenOffice Markdown.
Return only valid Mermaid source, without Markdown fences, explanations, or surrounding prose.
Preserve the user's language in visible labels. Prefer readable layouts and concise labels.
Never use HTML, click handlers, external links, JavaScript, or init directives.
When existing source is supplied, modify it according to the request instead of replacing unrelated content.`

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
}): Promise<string> {
  const settings: AiSettings = await window.markdownApi.getAiSettings()
  const zenmux = settings.providers.zenmux
  if (!zenmux?.apiKey) throw new Error('请先在设置中填写 ZenMux API-KEY')

  const current = args.currentSource?.trim()
  const response = await window.markdownApi.aiChat({
    settings: { ...settings, provider: 'zenmux' },
    system: MERMAID_SYSTEM,
    user: current
      ? `Modify this Mermaid source according to the instruction.\n\nINSTRUCTION:\n${args.instruction}\n\nCURRENT SOURCE:\n${current}`
      : `Create a Mermaid diagram for this instruction:\n\n${args.instruction}`,
  })
  if (!response.ok) throw new Error(response.error || 'ZenMux Mermaid request failed')
  const source = cleanMermaidSource(response.content ?? '')
  if (!source) throw new Error('ZenMux 没有返回 Mermaid 源码')
  return source
}
