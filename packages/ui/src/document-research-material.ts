const MATERIAL_MAX_CHARS = 12000

interface ResearchDocument {
  getText: (options: { blockSeparator: string }) => string
  state: {
    selection: { from: number; to: number; empty: boolean }
    doc: { textBetween: (from: number, to: number, blockSeparator?: string) => string }
  }
}

/** Selection when the user highlighted text; otherwise the whole document. */
export function documentResearchMaterial(editor: ResearchDocument, labeled = false): string {
  const { from, to, empty } = editor.state.selection
  const selected = empty || to <= from ? '' : editor.state.doc.textBetween(from, to, '\n\n').trim()
  const body = (selected || editor.getText({ blockSeparator: '\n\n' })).slice(0, MATERIAL_MAX_CHARS)
  if (!labeled || !body) return body
  return selected ? `【当前选区】\n${body}` : `【全文】\n${body}`
}
