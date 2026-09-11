type Copy = { name: string; goal: string; prompt: string }
export interface PhotoEnhancement {
  id: string
  icon: string
  zh: Copy
  en: Copy
}

export const photoEnhancements: PhotoEnhancement[] = [
  {
    id: 'portrait',
    icon: '◉',
    zh: {
      name: '高级人像',
      goal: '柔和补光 · 精致眼神 · 杂志质感',
      prompt:
        '把这张图调成专业影棚人像。柔化背景光线，在脸部加一层细微的补光去掉生硬阴影，突出眼睛细节和光泽。让画面干净、精致，具有杂志封面感。',
    },
    en: {
      name: 'Studio portrait',
      goal: 'Soft fill · Bright eyes · Editorial finish',
      prompt:
        'Give this image a professional studio portrait finish. Soften background lighting, add subtle facial fill to remove harsh shadows, and enhance eye detail and catchlights. Aim for a clean, refined magazine-cover look.',
    },
  },
  {
    id: 'cinema',
    icon: '▣',
    zh: {
      name: '电影感风格',
      goal: '城市夜景 · 冷暖对比 · 叙事氛围',
      prompt:
        '给这张城市照片做电影级调色。调整色调做出电影美学：阴影偏暗带蓝或青色，高光偏暖或霓虹感。整体提高对比度。给夜景或城市照片增加戏剧性、叙事感和现代氛围。',
    },
    en: {
      name: 'Cinematic color',
      goal: 'City nights · Color contrast · Drama',
      prompt:
        'Apply cinematic color grading to this city photo: deep blue or teal shadows, warm or neon highlights, and increased overall contrast. Create a dramatic, narrative, contemporary atmosphere.',
    },
  },
  {
    id: 'film',
    icon: '▤',
    zh: {
      name: '复古胶片',
      goal: '70 年代 35mm · 细腻颗粒 · 温暖怀旧',
      prompt:
        '把这张照片调成 70 年代 35mm 胶片机拍出来的感觉。加一层细腻的怀旧颗粒，整体饱和度稍微降低，加入柔和粉彩色调，黑色部分轻微褪色。营造复古、温暖、怀旧的美感。',
    },
    en: {
      name: 'Vintage film',
      goal: '1970s 35mm · Fine grain · Nostalgia',
      prompt:
        'Make this photo look as if it were shot on a 1970s 35mm film camera. Add fine nostalgic grain, slightly reduce saturation, introduce soft pastel tones, and gently fade the blacks for a warm vintage feel.',
    },
  },
  {
    id: 'golden',
    icon: '☀',
    zh: {
      name: '黄金时刻',
      goal: '户外照片 · 暖调侧光 · 柔和阴影',
      prompt:
        '调整这张户外照片的光线，模拟黄金时刻。从侧面加一层温暖、柔和、扩散的光晕，提高肤色暖度，柔化地面阴影。把生硬平淡的正午光线变成温暖又有氛围的场景。',
    },
    en: {
      name: 'Golden hour',
      goal: 'Outdoors · Warm sidelight · Soft shadows',
      prompt:
        'Relight this outdoor photo to simulate golden hour. Add warm, soft, diffused light from the side, warm skin tones, and soften ground shadows. Transform harsh flat midday lighting into a warm atmospheric scene.',
    },
  },
  {
    id: 'bokeh',
    icon: '◎',
    zh: {
      name: '专业虚化',
      goal: '突出主体 · f/1.4 景深 · 自然散景',
      prompt:
        '模拟微距镜头或 f/1.4 大光圈镜头的效果。主体保持完全清晰锐利，背景部分做渐进式、柔和自然的虚化（bokeh）。把主体从背景中分离出来，让视线立刻落在焦点上。',
    },
    en: {
      name: 'Selective focus',
      goal: 'Sharp subject · f/1.4 depth · Soft bokeh',
      prompt:
        'Simulate a macro or f/1.4 wide-aperture lens. Keep the subject completely sharp and apply progressive, soft, natural background bokeh. Separate the subject from the background to draw attention immediately to the focal point.',
    },
  },
  {
    id: 'monochrome',
    icon: '◐',
    zh: {
      name: '美术黑白',
      goal: '深邃黑色 · 丰富纹理 · 雕塑感',
      prompt:
        '把这张图转成高对比度的 Fine Art 黑白风格。确保黑色深邃纯净，白色干净明亮，中间调保留丰富细腻的纹理，突出形状和体积感。创造有艺术感、不过时、视觉冲击力强的画面。',
    },
    en: {
      name: 'Fine art B&W',
      goal: 'Deep blacks · Rich textures · Sculptural',
      prompt:
        'Convert this image to high-contrast fine art black and white. Keep blacks deep and pure, whites clean and bright, and midtones rich in fine texture. Emphasize shape and volume for a timeless, visually striking artistic image.',
    },
  },
  {
    id: 'landscape',
    icon: '△',
    zh: {
      name: '风景与自然',
      goal: '真实色彩 · 通透远景 · 丰富层次',
      prompt:
        '强化这张风景图，让视觉冲击力最大化。提高岩石纹理和植被的锐度与细节，增强绿色和大地色系但别显得假，修正明暗平衡让暗部细节显现，再加一层大气通透感让远处景物更清晰。突出自然之美，让画面有活力、清晰又有纵深。',
    },
    en: {
      name: 'Landscape & nature',
      goal: 'Natural color · Clear distance · Depth',
      prompt:
        'Enhance this landscape for strong visual impact. Bring out rock textures and vegetation detail, enrich greens and earth tones naturally, balance exposure to reveal shadow detail, and improve atmospheric clarity in distant scenery. Keep the result vivid, clear, and full of depth.',
    },
  },
]

export function photoEnhancementPrompt(preset: PhotoEnhancement, lang: 'zh' | 'en'): string {
  return (
    preset[lang].prompt +
    (lang === 'zh'
      ? '\n保留原图构图、主体身份和五官、物体结构及自然纹理，不添加或删除物体，不添加文字或水印，避免过度磨皮和不自然的处理痕迹。'
      : '\nPreserve the original composition, subject identity and facial features, object structure, and natural textures. Do not add or remove objects, text, or watermarks. Avoid excessive skin smoothing and unnatural processing.')
  )
}

// Keep the user's brief outside a replaceable, visible photography block.
export function applyPhotoEnhancement(
  text: string,
  preset: PhotoEnhancement | undefined,
  lang: 'zh' | 'en',
): string {
  const brief = text
    .replace(/\[(?:摄影增强|Photo enhancement)\][\s\S]*?\[\/(?:摄影增强|Photo enhancement)\]/g, '')
    .trim()
  if (!preset) return brief
  const label = lang === 'zh' ? '摄影增强' : 'Photo enhancement'
  const context =
    lang === 'zh'
      ? '有参考图时，按以下要求处理参考图；没有参考图时，按用户描述创作具有以下摄影效果的新图像。'
      : 'With a reference image, apply the following treatment to it. Without a reference, create a new image of the described subject with this photographic treatment.'
  return [brief, `[${label}]\n${context}\n${photoEnhancementPrompt(preset, lang)}\n[/${label}]`]
    .filter(Boolean)
    .join('\n\n')
}
