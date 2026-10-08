/** Ảnh chat hết hạn khi cron đã đánh dấu `expired`, hoặc `expires_at` đã qua. Thiếu cột/ngày sai → coi là còn hạn. */
export function isExpired(att: { expires_at?: string | null; expired?: boolean | null }, now: number | Date): boolean {
  if (att.expired === true) return true
  if (!att.expires_at) return false
  const t = Date.parse(att.expires_at)
  if (Number.isNaN(t)) return false
  return t <= (typeof now === 'number' ? now : now.getTime())
}
