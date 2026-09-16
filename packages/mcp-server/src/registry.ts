import { z } from 'zod'

export interface ToolContext {
  signal: AbortSignal
}
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string
  description: string
  module: string
  input: T
  readOnly: boolean
  execute: (args: z.output<T>, context: ToolContext) => Promise<unknown>
}
export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** The registry only advertises handlers that have actually been registered. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    if (!/^[a-z][a-z0-9_]{0,127}$/.test(definition.name)) throw new Error('Invalid MCP tool name')
    if (this.tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`)
    // Erase the generic only after preserving validation and execution together.
    this.tools.set(definition.name, definition as ToolDefinition)
  }

  list(module?: string) {
    return [...this.tools.values()]
      .filter((tool) => !module || tool.module === module)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: z.toJSONSchema(tool.input),
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: !tool.readOnly,
          openWorldHint: true,
        },
      }))
  }

  async call(name: string, args: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) return this.error('UNKNOWN_TOOL', `未注册的工具：${name}`)
    if (context.signal.aborted) return this.error('CANCELED', '调用已取消。')
    const parsed = tool.input.safeParse(args)
    if (!parsed.success)
      return this.error(
        'INVALID_ARGUMENTS',
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      )
    try {
      const result = await tool.execute(parsed.data, context)
      const text = JSON.stringify(result ?? null)
      return { content: [{ type: 'text', text }] }
    } catch (error) {
      return this.error(
        context.signal.aborted ? 'CANCELED' : 'EXECUTION_FAILED',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private error(code: string, message: string): ToolResult {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message }) }] }
  }
}
