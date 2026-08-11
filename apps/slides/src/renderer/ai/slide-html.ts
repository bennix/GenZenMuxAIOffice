/** Normalize a model reply to one complete HTML document. */
export function extractSlideHtml(raw: string): string | null {
  const unfenced = raw
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = unfenced.search(/<!doctype\s+html|<html\b/i)
  if (start < 0) return null
  const html = unfenced.slice(start)
  const end = html.toLowerCase().lastIndexOf('</html>')
  return end >= 0 ? html.slice(0, end + 7) : null
}
