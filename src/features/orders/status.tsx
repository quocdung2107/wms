export const STATUSES = [
  { code: 'CREATED', label: 'Chờ xử lý', icon: '🟡', cls: 'bg-amber-100 text-amber-900' },
  { code: 'CONFIRMED', label: 'Đã xác nhận', icon: '🔵', cls: 'bg-sky-100 text-sky-900' },
  { code: 'PICKING', label: 'Đang lấy hàng', icon: '🟠', cls: 'bg-orange-100 text-orange-900' },
  { code: 'IN_TRANSIT', label: 'Đang vận chuyển', icon: '🟣', cls: 'bg-violet-100 text-violet-900' },
  { code: 'DELIVERED', label: 'Đã giao', icon: '🟢', cls: 'bg-green-100 text-green-900' },
  { code: 'COMPLETED', label: 'Hoàn thành', icon: '✅', cls: 'bg-slate-200 text-slate-800' },
] as const

export const statusOf = (code: string) => STATUSES.find((s) => s.code === code) ?? STATUSES[0]

/** Trạng thái hiện cả màu lẫn chữ. */
export function StatusBadge({ code }: { code: string }) {
  const s = statusOf(code)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  )
}

export function AttentionBadge({ reason }: { reason: 'ISSUE' | 'STALE_24H' | null }) {
  if (!reason) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-900">
      <span aria-hidden>⚠️</span>
      {reason === 'ISSUE' ? 'Có sự cố' : 'Quá 24h'}
    </span>
  )
}
