// Source: https://developers.openai.com/api/docs/guides/image-prompting
// Reviewed 2026-09-10. Applies to image tasks, not a forced style for videos.
export const IMAGE_PROMPT_GUIDE = `For image generation and editing:
Begin with the requested outcome, subject and intended use. Preserve user intent before adding style.
Keep simple requests concise; structure complex briefs into scene, subject, details and constraints.
Describe relevant placement, scale, framing, pose, materials, lighting and colors concretely.
Do not invent a mandatory art style, palette, slogan, or unrelated detail.
Preserve required text and brand spelling verbatim, quote it, and specify placement and repetition count.
For edits, separate requested changes from invariants: identity, geometry, layout, labels and surrounding content.
Assign numbered reference images explicit roles. Sketches guide composition and proportions; rough marks are not a required finish unless requested.
Refine one change at a time and retain approved details from previous edits.
Keep model, quality, size and background settings in API parameters; prose alone does not set them.
Do not promise pixel-identical preservation, correct labels, or transparency without inspecting the result.
For video tasks, retain applicable user/reference constraints and follow video direction rather than forcing image-only styling.`

export function sketchReferenceGuidance(
  indices: number[],
  count: number,
  lang: 'zh' | 'en',
): string {
  const valid = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < count)
  if (!valid.length) return ''
  const numbers = valid.map((i) => i + 1).join(', ')
  return lang === 'zh'
    ? `Sketch 草图参考（参考图 ${numbers}）：这些图用于构图、主体位置、相对大小与空间关系。遵循用户要求完成细节和材质，不要把粗线、辅助标记或白底当成必须保留的最终画风；用户明确要求手绘风格时除外。其他参考图仍按其主体、风格或背景角色使用。`
    : `Sketch references (images ${numbers}): use these for composition, subject placement, relative scale and spatial relationships. Finish details and materials as requested; do not preserve rough lines, guide marks or white backgrounds as the final style unless the user asks for a hand-drawn result. Other references retain their subject, style or background roles.`
}
