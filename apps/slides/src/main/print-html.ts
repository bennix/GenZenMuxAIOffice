import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Keep image-heavy decks out of navigation URLs, which Chromium limits in size.
 * The caller keeps the file alive until printing/export finishes and the window closes. */
export async function loadPrintHtml(
  window: { loadFile(path: string): Promise<void> },
  html: string,
): Promise<() => Promise<void>> {
  const dir = await mkdtemp(join(tmpdir(), 'zenoffice-slides-print-'))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const path = join(dir, 'print.html')
    await writeFile(path, html, 'utf8')
    await window.loadFile(path)
    return cleanup
  } catch (error) {
    await cleanup()
    throw error
  }
}
