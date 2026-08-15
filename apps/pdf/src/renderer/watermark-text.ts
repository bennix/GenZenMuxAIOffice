/** Insert clipboard text at the current input selection. Watermarks are single-line,
 * so pasted line breaks are folded to spaces instead of being silently discarded. */
export function pasteWatermarkText(
  current: string,
  pasted: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  const clean = pasted.replace(/\r?\n+/g, ' ')
  const from = Math.max(0, Math.min(start, current.length))
  const to = Math.max(from, Math.min(end, current.length))
  return {
    text: current.slice(0, from) + clean + current.slice(to),
    caret: from + clean.length,
  }
}
