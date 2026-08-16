/** Remove redundant, unescaped `$` delimiters from TeX that is already inside math mode. */
export function stripNestedMathDelimiters(tex: string): string {
  let output = ''
  for (let index = 0; index < tex.length; index += 1) {
    const character = tex[index] ?? ''
    if (character !== '$') {
      output += character
      continue
    }
    let backslashes = 0
    for (let cursor = index - 1; cursor >= 0 && tex[cursor] === '\\'; cursor -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 1) output += character
  }
  return output
}
