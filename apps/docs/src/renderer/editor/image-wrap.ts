export type ImageWrapAttributes = Record<string, unknown>

export interface ImageWrapAttributePatch {
  imageWrap: string | null
  imagePosH?: 'left' | 'center' | 'right' | null
  imagePosV?: 'top' | 'center' | 'bottom' | null
  imageOffsetXEmu?: null
  imageOffsetYEmu?: null
}

const drawingLayerWraps = new Set(['front', 'behind'])

/**
 * Build the attribute patch used by every Wrap Text entry point.
 * Side wrapping does not paint numeric wp:posOffset values; carrying those
 * latent offsets into the absolute front/behind layer can move the picture
 * completely outside the paper. Preserve its visible alignment and start the
 * new layer at the current paragraph anchor instead.
 */
export function imageWrapAttributes(
  attrs: ImageWrapAttributes,
  nextWrap: string | null,
): ImageWrapAttributePatch {
  if (nextWrap === null) {
    return {
      imageWrap: null,
      imagePosH: null,
      imagePosV: null,
      imageOffsetXEmu: null,
      imageOffsetYEmu: null,
    }
  }

  const currentWrap = typeof attrs.imageWrap === 'string' ? attrs.imageWrap : null
  if (!drawingLayerWraps.has(nextWrap) || drawingLayerWraps.has(currentWrap ?? '')) {
    return { imageWrap: nextWrap }
  }

  const storedH =
    attrs.imagePosH === 'left' || attrs.imagePosH === 'center' || attrs.imagePosH === 'right'
      ? attrs.imagePosH
      : null
  const imageAlign =
    attrs.imageAlign === 'left' || attrs.imageAlign === 'center' || attrs.imageAlign === 'right'
      ? attrs.imageAlign
      : null
  const inferredH = currentWrap?.endsWith('-right')
    ? 'right'
    : currentWrap?.endsWith('-left')
      ? 'left'
      : currentWrap === 'topBottom'
        ? 'center'
        : (storedH ?? imageAlign ?? 'left')
  const storedV =
    attrs.imagePosV === 'top' || attrs.imagePosV === 'center' || attrs.imagePosV === 'bottom'
      ? attrs.imagePosV
      : 'top'

  return {
    imageWrap: nextWrap,
    imagePosH: inferredH,
    imagePosV: storedV,
    imageOffsetXEmu: null,
    imageOffsetYEmu: null,
  }
}
