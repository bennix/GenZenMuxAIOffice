import { BrowserWindow, nativeImage } from 'electron'
import { aiFetch } from '@genoffice/ai-provider'
import {
  buildEditableSlidePptx,
  checkEditableSlide,
  type EditableHtmlPage,
} from './html-to-editable-pptx'

export const renderHtmlPage = async (
  rawHtml: string,
): Promise<{ bytes: Uint8Array; imageFailures: string[] }> => {
  if (!/<html\b/i.test(rawHtml) || !/<head\b/i.test(rawHtml) || !/<\/html>/i.test(rawHtml)) {
    throw new Error('invalid generated slide HTML')
  }
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; font-src data:;">'
  const html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
    .replace(/<head([^>]*)>/i, `<head$1>${csp}`)
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await win.webContents.executeJavaScript(
      `Promise.race([
        Promise.all(Array.from(document.images).map((img) => img.complete ? null : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }))),
        new Promise((resolve) => setTimeout(resolve, 8000))
      ]).then(() => document.fonts && document.fonts.ready).catch(() => undefined)`,
      true,
    )
    const page = (await win.webContents.executeJavaScript(
      `(() => {
        const parseColor = (value) => {
          const m = String(value || '').match(/rgba?\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)(?:\\s*[,/]\\s*(\\d*(?:\\.\\d+)?))?\\s*\\)/i);
          if (!m) return null;
          const hex = [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')).join('').toUpperCase();
          const alpha = m[4] == null || m[4] === '' ? 1 : Math.max(0, Math.min(1, Number(m[4])));
          return { hex, transparency: Math.round((1 - alpha) * 100) };
        };
        const visible = (el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0.5 && r.height > 0.5;
        };
        const bodyStyle = getComputedStyle(document.body);
        const htmlStyle = getComputedStyle(document.documentElement);
        const bg = parseColor(bodyStyle.backgroundColor);
        const htmlBg = parseColor(htmlStyle.backgroundColor);
        const marked = Array.from(document.querySelectorAll('[data-pptx-kind]')).filter(visible);
        const hasMarked = marked.length > 0;
        const elements = Array.from(document.body.querySelectorAll('*')).filter(visible);
        const semanticText = new Set(['H1','H2','H3','H4','H5','H6','P','LI','TD','TH','BLOCKQUOTE','FIGCAPTION','LABEL','SPAN','STRONG','EM','SMALL']);
        const nodes = [];
        const measureWrap = (el, fontPx, contentLeft, contentRight) => {
          let range;
          try {
            range = document.createRange();
            range.selectNodeContents(el);
          } catch (err) {
            return { widenPx: 0, unwrapLines: 0 };
          }
          const merged = [];
          for (const rect of range.getClientRects()) {
            if (rect.width < 0.5 || rect.height < 0.5) continue;
            let hit = null;
            for (const line of merged) {
              const mid = rect.top + rect.height / 2;
              if (Math.abs(line.top + line.h / 2 - mid) < Math.max(2, rect.height * 0.45)) {
                hit = line;
                break;
              }
            }
            if (hit) {
              hit.left = Math.min(hit.left, rect.left);
              hit.right = Math.max(hit.right, rect.right);
              hit.w = hit.right - hit.left;
              hit.h = Math.max(hit.h, rect.height);
            } else {
              merged.push({ top: rect.top, left: rect.left, right: rect.right, w: rect.width, h: rect.height });
            }
          }
          const contentW = Math.max(1, contentRight - contentLeft);
          let widenPx = 0;
          let unwrapLines = 0;
          for (let i = 1; i < merged.length; i++) {
            const prev = merged[i - 1];
            const cur = merged[i];
            const prevFilled = prev.right >= contentRight - fontPx * 1.15;
            const shortTail = cur.w <= fontPx * 4.5 && cur.w < prev.w * 0.5;
            if (prevFilled && shortTail) {
              widenPx = Math.max(widenPx, cur.w + fontPx * 0.4);
              unwrapLines += 1;
            }
          }
          if (merged.length === 1 && merged[0].w >= contentW - 1.5) {
            widenPx = Math.max(widenPx, Math.max(8, fontPx * 0.85));
          }
          return { widenPx: Math.round(widenPx), unwrapLines };
        };
        for (const el of elements) {
          if (nodes.length >= 500) break;
          const firstNode = nodes.length;
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const kind = el.getAttribute('data-pptx-kind');
          const fill = parseColor(s.backgroundColor);
          const line = parseColor(s.borderTopColor);
          const lineWidth = parseFloat(s.borderTopWidth) || 0;
          const x = r.left;
          const y = r.top;
          const w = r.width;
          let h = r.height;
          if (w <= 0 || h <= 0) continue;
          const shouldShape = kind === 'shape' || (!hasMarked && ((fill && fill.transparency < 99) || lineWidth > 0));
          if (shouldShape) nodes.push({ kind:'shape', x, y, w, h, fill:fill?.hex, fillTransparency:fill?.transparency, lineColor:line?.hex, lineTransparency:line?.transparency, lineWidth, radius:parseFloat(s.borderTopLeftRadius) || 0, opacity:Number(s.opacity) || 1 });
          if ((kind === 'image' || !kind) && el.tagName === 'IMG') {
            nodes.push({ kind:'image', x, y, w, h, src:el.currentSrc || el.src, objectFit:['cover','contain','fill'].includes(s.objectFit) ? s.objectFit : 'fill', opacity:Number(s.opacity) || 1 });
            for (let i = firstNode; i < nodes.length; i++) nodes[i].zIndex = s.zIndex === 'auto' ? undefined : Number(s.zIndex);
            continue;
          }
          const text = String(el.innerText || '').replace(/\\s+\\n/g, '\\n').trim();
          const hasSemanticChild = Array.from(el.children).some((child) => semanticText.has(child.tagName) && String(child.innerText || '').trim());
          const shouldText = kind === 'text' || (!kind && text && (semanticText.has(el.tagName) || el.children.length === 0) && !hasSemanticChild);
          for (let i = firstNode; i < nodes.length; i++) nodes[i].zIndex = s.zIndex === 'auto' ? undefined : Number(s.zIndex);
          if (!shouldText || !text) continue;
          const color = parseColor(s.color);
          const weight = Number(s.fontWeight) || (s.fontWeight === 'bold' ? 700 : 400);
          const align = s.textAlign === 'center' ? 'center' : (s.textAlign === 'right' || s.textAlign === 'end' ? 'right' : 'left');
          const valign = s.display.includes('flex') && s.alignItems === 'center' ? 'middle' : 'top';
          const fontPx = parseFloat(s.fontSize) || 18;
          const padL = parseFloat(s.paddingLeft) || 0;
          const padR = parseFloat(s.paddingRight) || 0;
          const contentLeft = r.left + (parseFloat(s.borderLeftWidth) || 0) + padL;
          const contentRight = r.right - (parseFloat(s.borderRightWidth) || 0) - padR;
          const wrap = measureWrap(el, fontPx, contentLeft, contentRight);
          const glyphRange = document.createRange();
          glyphRange.selectNodeContents(el);
          const glyphBounds = glyphRange.getBoundingClientRect();
          h = Math.max(h, glyphBounds.bottom - y + (parseFloat(s.paddingBottom) || 0));
          const textNode = { kind:'text', textRole: ['title', 'body', 'caption', 'footer'].includes(el.dataset.pptxRole) ? el.dataset.pptxRole : undefined, x, y, w, h, text:el.tagName === 'LI' && !text.startsWith('•') ? '• ' + text : text, color:color?.hex, fontFace:s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fontSize:fontPx, bold:weight >= 600, italic:s.fontStyle === 'italic', underline:s.textDecorationLine.includes('underline'), align, valign, lineHeight:parseFloat(s.lineHeight) || undefined, charSpacing:parseFloat(s.letterSpacing) || undefined, opacity:Number(s.opacity) || 1 };
          if (wrap.widenPx > 0) textNode.widenPx = wrap.widenPx;
          if (wrap.unwrapLines > 0) textNode.unwrapLines = wrap.unwrapLines;
          nodes.push(textNode);
          nodes[nodes.length - 1].zIndex = s.zIndex === 'auto' ? undefined : Number(s.zIndex);
        }
        return { width: innerWidth, height: innerHeight, background: (bg && bg.transparency < 100 ? bg.hex : htmlBg?.hex) || 'FFFFFF', nodes };
      })()`,
      true,
    )) as EditableHtmlPage
    if (!page.nodes.some((node) => node.kind === 'text')) {
      throw new Error('generated slide contains no editable text objects')
    }
    const issues = checkEditableSlide(page)
    if (issues.length)
      throw new Error(
        'Slide layout check failed: ' + issues.map((issue) => issue.message).join(' '),
      )
    return await buildEditableSlidePptx(page, async (src) => {
      if (!src) return null
      try {
        const image = src.startsWith('data:')
          ? nativeImage.createFromDataURL(src)
          : await (async () => {
              if (!/^https?:\/\//i.test(src)) return nativeImage.createEmpty()
              const response = await aiFetch(src)
              if (!response.ok) return nativeImage.createEmpty()
              const bytes = Buffer.from(await response.arrayBuffer())
              if (bytes.length === 0 || bytes.length > 25_000_000) return nativeImage.createEmpty()
              return nativeImage.createFromBuffer(bytes)
            })()
        if (image.isEmpty()) return null
        return `data:image/png;base64,${image.toPNG().toString('base64')}`
      } catch {
        return null
      }
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
