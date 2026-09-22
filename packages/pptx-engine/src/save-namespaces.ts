/** Repair prefixes introduced by XML patches without changing valid source XML. */
export function repairGeneratedNamespaces(xml: string): string {
  const known: Record<string, string> = {
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  }
  const root = /<(?![!?/])[\w:.-]+\b[^>]*>/.exec(xml)
  if (!root) return xml
  const candidates = Object.keys(known).filter(
    (prefix) => !new RegExp(`\\sxmlns:${prefix}\\s*=`).test(root[0]),
  )
  if (!candidates.length) return xml
  const missing = new Set<string>()
  const scopes: Set<string>[] = [new Set()]
  for (const match of xml.matchAll(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g,
  )) {
    const tag = match[0]
    if (/^<[!?]/.test(tag)) continue
    if (tag.startsWith('</')) {
      if (scopes.length > 1) scopes.pop()
      continue
    }
    const scope = new Set(scopes[scopes.length - 1])
    for (const declaration of tag.matchAll(/\sxmlns:([\w.-]+)\s*=/g)) scope.add(declaration[1])
    for (const prefix of candidates) {
      // Remove quoted values so literal text cannot be mistaken for a QName.
      const names = tag.replace(/"[^"]*"|'[^']*'/g, '""')
      if (!scope.has(prefix) && new RegExp(`(?:<|\\s)${prefix}:`).test(names)) missing.add(prefix)
    }
    if (!tag.endsWith('/>')) scopes.push(scope)
  }
  if (!missing.size) return xml
  const declarations = [...missing].map((prefix) => ` xmlns:${prefix}="${known[prefix]}"`).join('')
  const at = root.index + root[0].length - (root[0].endsWith('/>') ? 2 : 1)
  return xml.slice(0, at) + declarations + xml.slice(at)
}
