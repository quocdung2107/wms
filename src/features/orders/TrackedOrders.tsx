import { useEffect } from 'react'
import { useLoad } from '../../shared/ui/ui'
import { sb } from './api'
import { AttentionBadge, StatusBadge } from './status'
import type { GroupCtx, Order } from './types'
import { useRealtime } from './useRealtime'

/** Khối thu gọn "Đơn đang theo dõi": đơn chưa COMPLETED, Cần chú ý lên đầu. Bấm để mở Compact Panel. */
export function TrackedOrders({ ctx, selectedId, onSelect }: { ctx: GroupCtx; selectedId: string | null; onSelect: (id: string) => void }) {
  const orders = useLoad(async () => {
    const { data, error } = await sb().from('orders_view').select('*').eq('group_id', ctx.groupId).neq('status', 'COMPLETED').order('last_activity_at', { ascending: false }).limit(200)
    if (error) throw error
    return data as Order[]
  }, [ctx.groupId])
  useRealtime(ctx.groupId, ['orders'], () => orders.reload())
  // "Quá 24h" tính lúc truy vấn → tải lại định kỳ.
  useEffect(() => {
    const t = setInterval(() => orders.reload(), 5 * 60 * 1000)
    return () => clearInterval(t)
  })

  if (orders.error) return <p className="text-sm text-red-800">Không tải được đơn đang theo dõi.</p>
  const list = [...(orders.data ?? [])].sort((a, b) => Number(b.needs_attention) - Number(a.needs_attention))
  const n = list.filter((o) => o.needs_attention).length

  return (
    <details open className="rounded-xl bg-white shadow-sm">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-base font-semibold">
        Đơn đang theo dõi ({list.length}){n > 0 && <span className="ml-2 text-red-800">⚠️ {n} cần chú ý</span>}
      </summary>
      {orders.data && list.length === 0 && <p className="px-3 pb-3 text-slate-600">Không có đơn đang mở.</p>}
      <ul className="max-h-48 space-y-1 overflow-y-auto px-2 pb-2">
        {list.map((o) => (
          <li key={o.id}>
            <button
              onClick={() => onSelect(o.id)}
              aria-pressed={selectedId === o.id}
              className={`flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50 ${selectedId === o.id ? 'ring-2 ring-teal-600' : ''} ${o.needs_attention ? 'border-l-4 border-red-500' : ''}`}
            >
              <span className="font-mono text-sm text-slate-700">{o.code}</span>
              <StatusBadge code={o.status} />
              <AttentionBadge reason={o.attention_reason} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
