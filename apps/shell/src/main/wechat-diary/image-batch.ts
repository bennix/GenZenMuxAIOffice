import type { PendingWechatImage } from './store'

export const WECHAT_IMAGE_BATCH_SIZE = 5

/** Text flushes the current batch immediately; bare images wait until five are available. */
export function selectWechatImageBatch(
  images: PendingWechatImage[],
  userId: string,
  hasText: boolean,
): PendingWechatImage[] {
  const pending = images
    .filter((image) => image.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt)
  if (!hasText && pending.length < WECHAT_IMAGE_BATCH_SIZE) return []
  return pending.slice(0, WECHAT_IMAGE_BATCH_SIZE)
}
