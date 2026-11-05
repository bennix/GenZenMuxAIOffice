/** Plain text only: never mount incomplete generated HTML in the application. */
export function liveDraftPreview(source: string): string {
  const html = /<!doctype|<html|<style|<div|<body/i.test(source)
  const text = html
    ? source
        .replace(/<(style|script|head)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '')
        .replace(/<[^>]*(>|$)/g, '\n')
        .replace(/```(?:html)?/g, '')
    : source
  return text
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .slice(-1200)
}
