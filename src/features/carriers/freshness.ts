// Nhãn độ mới của hồ sơ nhà vận tải, tính từ last_verified_at.
export const FRESHNESS_THRESHOLDS = { recentDays: 7, staleDays: 30 } as const

export type Freshness = 'recent' | 'not_recent' | 'outdated'

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  recent: 'Active recently',
  not_recent: 'Not recently verified',
  outdated: 'Information may be outdated',
}

const DAY_MS = 86_400_000

export function freshnessOf(
  lastVerifiedAt: string | Date | null | undefined,
  now: Date = new Date(),
): Freshness {
  if (lastVerifiedAt == null) return 'outdated'
  const t = new Date(lastVerifiedAt).getTime()
  if (Number.isNaN(t)) return 'outdated'
  const days = (now.getTime() - t) / DAY_MS
  if (days < FRESHNESS_THRESHOLDS.recentDays) return 'recent'
  if (days <= FRESHNESS_THRESHOLDS.staleDays) return 'not_recent'
  return 'outdated'
}

export function freshnessLabel(
  lastVerifiedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  return FRESHNESS_LABELS[freshnessOf(lastVerifiedAt, now)]
}
