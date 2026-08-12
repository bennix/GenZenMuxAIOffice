import type { AgentSkill } from '@genoffice/agent-core'
import type { AttachmentMeta } from '../../shared/ipc'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export function createFilesSkill(getAttachments: () => AttachmentMeta[]): AgentSkill {
  return {
    id: 'files',
    systemPrompt: `## Attachments
The user may attach up to five local files. Use read_attachment before answering about a text-like attachment. Image attachments are already supplied as multimodal images; inspect them directly. Long files can be read in pages by passing the previous end position as offset.`,
    tools: [
      {
        name: 'read_attachment',
        description: 'Read text extracted locally from an attached file.',
        inputSchema: {
          type: 'object',
          properties: { index: { type: 'integer' }, offset: { type: 'integer' } },
          required: ['index'],
        },
      },
    ],
    buildContext: () => {
      const files = getAttachments()
      return files.length
        ? `Attachment list:\n${files.map((file, index) => `${index} | ${file.name} | .${file.ext} | ${file.sizeBytes} bytes`).join('\n')}`
        : ''
    },
    executeTool: async (call) => {
      const file = getAttachments()[Number(call.input.index)]
      if (!file)
        return { output: 'Invalid attachment index.', isError: true, summary: 'Read attachment' }
      if (IMAGE_EXTS.has(file.ext))
        return {
          output: 'This image is already included in the multimodal user message.',
          summary: `View ${file.name}`,
        }
      const offset = Math.max(0, Number(call.input.offset) || 0)
      const result = await window.markdownApi.readAttachment(file.path, offset, 24_000)
      if (!result.ok)
        return {
          output: result.error ?? 'Read failed',
          isError: true,
          summary: `Read ${file.name}`,
        }
      const end = (result.offset ?? 0) + (result.text?.length ?? 0)
      return {
        output: `File ${file.name}; characters ${result.offset ?? 0}-${end} of ${result.totalChars ?? end}.\n---\n${result.text ?? ''}`,
        summary: `Read ${file.name}`,
      }
    },
  }
}
