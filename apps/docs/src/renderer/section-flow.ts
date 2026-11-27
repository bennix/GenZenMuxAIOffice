import type { SectionInfo } from '@genoffice/docx-engine'
import { sectionColGeom } from './pagination'

/** One CSS column context cannot represent sections with different text widths. */
export function hasMixedSectionFlow(sections: SectionInfo[]): boolean {
  const first = sections[0] && sectionColGeom(sections[0])
  return (
    !!first &&
    sections.some((section) => {
      const geometry = sectionColGeom(section)
      return geometry.cols !== first.cols || Math.abs(geometry.colWidthPx - first.colWidthPx) > 0.5
    })
  )
}

/** Temporary, section-specific widths for the print snapshot, restored after cloning. */
export function measureSectionWidths(root: HTMLElement, sections: SectionInfo[]): () => void {
  const restore: Array<() => void> = []
  let sectionIndex = 0
  for (const child of Array.from(root.children) as HTMLElement[]) {
    const index = child.getAttribute('data-idx')
    if (index !== null) {
      const found = sections.findIndex((section) => Number(index) <= section.lastBlockIndex)
      if (found >= 0) sectionIndex = found
    }
    const section = sections[sectionIndex]
    if (!section || child.classList.contains('page-gap')) continue
    const previous = child.getAttribute('style')
    const computed = getComputedStyle(child)
    const margins = (parseFloat(computed.marginLeft) || 0) + (parseFloat(computed.marginRight) || 0)
    child.style.width = `${Math.max(1, sectionColGeom(section).colWidthPx - margins)}px`
    child.style.boxSizing = 'border-box'
    restore.push(() => {
      if (previous === null) child.removeAttribute('style')
      else child.setAttribute('style', previous)
    })
  }
  return () => restore.forEach((fn) => fn())
}
