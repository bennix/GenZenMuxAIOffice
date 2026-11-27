import { latexToOmml, scanBody } from '@genoffice/docx-engine'

/** Split only direct children; never reserialize untouched Word XML. */
function children(xml: string) {
  const open = /^<(?:[^<>"']|"[^"]*"|'[^']*')*>/.exec(xml)?.[0]
  const end = xml.lastIndexOf('</')
  if (!open || end < open.length) throw new Error('无法定位原始公式结构')
  const wrapped = `<w:body>${xml.slice(open.length, end)}</w:body>`
  return {
    open,
    close: xml.slice(end),
    parts: scanBody(wrapped).elements.map((part) => ({
      name: part.name,
      xml: wrapped.slice(part.start, part.end),
    })),
  }
}

/** Replace one embedded formula, retaining paragraph/run properties, surrounding text and numbering. */
export function replaceEmbeddedEquation(sourceXml: string, latex: string): string {
  if ((sourceXml.match(/<w:object\b/g) ?? []).length !== 1)
    throw new Error('此段包含多个嵌入对象，不能自动确定要替换的公式；原文未修改。')
  const paragraph = children(sourceXml)
  if (!paragraph.open.startsWith('<w:p')) throw new Error('无法定位公式段落；原文未修改。')
  const math = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${latexToOmml(latex)}</m:oMath>`
  let replaced = false
  const result = paragraph.parts
    .map((part) => {
      if (part.name !== 'w:r' || !part.xml.includes('<w:object')) return part.xml
      const run = children(part.xml)
      const objectIndex = run.parts.findIndex((child) => child.name === 'w:object')
      if (objectIndex < 0) throw new Error('无法安全定位原嵌入对象；原文未修改。')
      const properties = run.parts.find((child) => child.name === 'w:rPr')?.xml ?? ''
      const side = (parts: typeof run.parts) => {
        const body = parts
          .filter((child) => child.name !== 'w:rPr')
          .map((child) => child.xml)
          .join('')
        return body ? `${run.open}${properties}${body}${run.close}` : ''
      }
      replaced = true
      return side(run.parts.slice(0, objectIndex)) + math + side(run.parts.slice(objectIndex + 1))
    })
    .join('')
  if (!replaced) throw new Error('无法安全定位原嵌入对象；原文未修改。')
  return paragraph.open + result + paragraph.close
}

export function replaceEquationXml(sourceXml: string, latex: string): string {
  if (sourceXml.includes('<w:object')) return replaceEmbeddedEquation(sourceXml, latex)
  const equations = sourceXml.match(/<m:oMath(?:\s[^>]*)?>[\s\S]*?<\/m:oMath>/g) ?? []
  if (equations.length !== 1) throw new Error('无法安全确定要替换的公式；原文未修改。')
  const math = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${latexToOmml(latex)}</m:oMath>`
  return sourceXml.replace(equations[0], math)
}

/** Do not offer equation conversion for embedded spreadsheets, PDFs or arbitrary pictures. */
export function isLegacyEquation(attrs: Record<string, unknown>): boolean {
  return (
    attrs.label === 'Embedded object' &&
    typeof attrs.imageDataUrl === 'string' &&
    /^(?:Equation(?:\.|$)|MathType(?:\.|$))/i.test(String(attrs.oleProgId ?? ''))
  )
}
