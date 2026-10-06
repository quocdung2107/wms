import { useEffect, useRef, useState } from 'react'
import { Button, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { errText, sb } from './api'
import { fmtDay, fmtTime } from './format'
import { AttentionBadge, StatusBadge } from './status'
import type { GroupCtx, Message, Order } from './types'
import { useRealtime } from './useRealtime'

function OrderCard({ order, loading, onOpen }: { order: Order | undefined; loading: boolean; onOpen?: (id: string) => void }) {
  if (!order) return <div className="inline-block rounded-lg bg-white px-3 py-2 text-slate-500">{loading ? 'Đang tải đơn…' : 'Đơn không còn truy cập được.'}</div>
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={() => onOpen?.(order.id)}
      className={`block w-full max-w-sm space-y-1 rounded-xl border bg-white p-3 text-left shadow-sm hover:bg-slate-50 ${order.needs_attention ? 'border-red-400' : 'border-teal-600'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-600">📦 {order.code}</span>
        <StatusBadge code={order.status} />
        {order.priority === 'URGENT' && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-medium text-white">🔥 Gấp</span>}
        <AttentionBadge reason={order.attention_reason} />
      </div>
      <div className="font-semibold">{order.goods}</div>
      <div className="text-sm text-slate-700">
        {order.weight_kg} kg · {order.packages} kiện · giao {fmtDay(order.delivery_at)}
      </div>
      {onOpen && <div className="text-sm text-teal-800">Bấm để xem, cập nhật trạng thái, nhắn riêng trong đơn →</div>}
    </button>
  )
}

/** Chat chung của group (orderId = null) hoặc chat riêng trong một đơn. */
export function Chat({ ctx, orderId, onOpenOrder }: { ctx: GroupCtx; orderId: string | null; onOpenOrder?: (id: string) => void }) {
  const [extra, setExtra] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [ordersTick, setOrdersTick] = useState(0)
  const end = useRef<HTMLDivElement>(null)

  const initial = useLoad(async () => {
    let q = sb().from('messages').select('*').eq('group_id', ctx.groupId)
    q = orderId ? q.eq('order_id', orderId) : q.is('order_id', null)
    const { data, error } = await q.order('id', { ascending: false }).limit(100)
    if (error) throw error
    return (data as Message[]).reverse()
  }, [ctx.groupId, orderId])

  useRealtime(ctx.groupId, ['messages', 'orders'], (t, p) => {
    if (t === 'orders') {
      setOrdersTick((n) => n + 1)
      return
    }
    if (p.eventType !== 'INSERT') return
    const m = p.new as Message
    if ((m.order_id ?? null) !== orderId) return
    setExtra((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]))
  })

  const all = [...(initial.data ?? [])]
  for (const m of extra) if (!all.some((y) => y.id === m.id)) all.push(m)

  // Thẻ đơn lấy trạng thái trực tiếp từ đơn thật (không sao chép vào tin nhắn).
  const cardIds = [...new Set(all.map((m) => m.shared_order_id).filter((x): x is string => !!x))].sort()
  const cards = useLoad(async () => {
    if (cardIds.length === 0) return new Map<string, Order>()
    const { data, error } = await sb().from('orders_view').select('*').in('id', cardIds)
    if (error) throw error
    return new Map((data as Order[]).map((o) => [o.id, o]))
  }, [cardIds.join(','), ordersTick])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [all.length])

  async function send() {
    const text = body.trim()
    if (!text) return
    setErr('')
    const { error } = await sb().from('messages').insert({ group_id: ctx.groupId, order_id: orderId, sender_id: ctx.me, body: text })
    if (error) setErr(errText(error))
    else setBody('')
  }

  return (
    <div className="space-y-3">
      <div className="max-h-96 min-h-32 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
        {initial.error && <Notice kind="error">Không tải được tin nhắn.</Notice>}
        {all.length === 0 && !initial.loading && <p className="text-slate-500">Chưa có tin nhắn.</p>}
        {all.map((m) => (
          <div key={m.id} className={m.sender_id === ctx.me ? 'text-right' : ''}>
            <div className="text-xs text-slate-500">
              {m.sender_id === ctx.me ? 'Bạn' : ctx.nameOf(m.sender_id)} · {fmtTime(m.created_at)}
            </div>
            {m.shared_order_id ? (
              <OrderCard order={cards.data?.get(m.shared_order_id)} loading={cards.loading} onOpen={onOpenOrder} />
            ) : (
              <div className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left ${m.sender_id === ctx.me ? 'bg-teal-100' : 'bg-white'}`}>{m.body}</div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input className={inputClass} maxLength={2000} placeholder="Nhập tin nhắn…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" kind="primary" disabled={!body.trim()}>
          Gửi
        </Button>
      </form>
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  )
}
