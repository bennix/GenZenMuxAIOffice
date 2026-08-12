import type { JSONContent } from '@tiptap/core'

function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]<>])/g, '\\$1')
}

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n'
      if (node.type === 'docInlineMath') return `$${String(node.attrs?.latex ?? node.text ?? '')}$`
      if (node.type === 'image') {
        return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')})`
      }
      if (node.type !== 'text') return inline(node.content)
      let value = escapeText(node.text ?? '')
      for (const mark of node.marks ?? []) {
        if (mark.type === 'code') value = `\`${value.replace(/`/g, '\\`')}\``
        else if (mark.type === 'bold') value = `**${value}**`
        else if (mark.type === 'italic') value = `*${value}*`
        else if (mark.type === 'strike') value = `~~${value}~~`
        else if (mark.type === 'link') value = `[${value}](${String(mark.attrs?.href ?? '')})`
      }
      return value
    })
    .join('')
}

function tableCell(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => inline(child.content))
    .join('<br>')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
}

function table(node: JSONContent): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map(tableCell))
  if (!rows.length) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')])
  const header = normalized[0]
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function list(node: JSONContent, ordered: boolean, depth: number): string {
  return (node.content ?? [])
    .map((item, index) => {
      const children = item.content ?? []
      const first = children.find((child) => child.type === 'paragraph')
      const marker =
        item.type === 'taskItem'
          ? `- [${item.attrs?.checked ? 'x' : ' '}]`
          : ordered
            ? `${index + 1}.`
            : '-'
      const lines = [`${'    '.repeat(depth)}${marker} ${inline(first?.content)}`]
      for (const child of children) {
        if (child === first) continue
        if (child.type === 'bulletList' || child.type === 'taskList')
          lines.push(list(child, false, depth + 1))
        else if (child.type === 'orderedList') lines.push(list(child, true, depth + 1))
        else lines.push(`${'    '.repeat(depth + 1)}${block(child, depth + 1)}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

function block(node: JSONContent, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content)
    case 'heading':
      return `${'#'.repeat(Math.min(6, Number(node.attrs?.level) || 1))} ${inline(node.content)}`
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => block(child, depth))
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'bulletList':
    case 'taskList':
      return list(node, false, depth)
    case 'orderedList':
      return list(node, true, depth)
    case 'codeBlock':
      return `\`\`\`${String(node.attrs?.language ?? '')}\n${node.content?.map((child) => child.text ?? '').join('') ?? ''}\n\`\`\``
    case 'horizontalRule':
      return '---'
    case 'table':
      return table(node)
    case 'image':
      return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')})`
    case 'docInlineMath':
      return `$${String(node.attrs?.latex ?? '')}$`
    case 'docProtected': {
      const latex = String(node.attrs?.formulaDisplay?.latex ?? '')
      return latex ? `$$\n${latex}\n$$` : inline(node.content)
    }
    default:
      return inline(node.content)
  }
}

/** Convert the editable Word document model to portable Markdown + LaTeX. */
export function docJsonToMarkdown(doc: JSONContent): string {
  return (
    (doc.content ?? [])
      .map((node) => block(node))
      .filter(Boolean)
      .join('\n\n')
      .trimEnd() + '\n'
  )
}
