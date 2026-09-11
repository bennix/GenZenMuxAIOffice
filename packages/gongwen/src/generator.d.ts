export type GongwenFormat = 'ordinary' | 'formal' | 'letter' | 'command' | 'minutes'
export interface GongwenRequest {
  markdown: string
  options: Record<string, string | boolean>
}
export function generateGongwen(
  markdown: string,
  options?: Record<string, string | boolean>,
): Promise<{ bytes: Buffer; warnings: string[] }>
