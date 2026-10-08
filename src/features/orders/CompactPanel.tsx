import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { pushStatusLine, rpc, sb } from './api'
import { ago, fmtDay, fmtTime } from './format'
import { NoteAction } from './NoteAction'
import { AttentionBadge, StatusBadge, STATUSES, statusOf } from './status'
import type { GroupCtx, Order, OrderEvent } from './types'
import { useRealtime } from './useRealtime'

/** Panel gọn trong view Chat: tóm tắt, đổi trạng thái, Order Note, vài sự kiện gần nhất. Cùng RPC với OrderDetail. */
export function CompactPanel({ ctx, orderId, onClose, onOpenFull }: { ctx: GroupCtx; orderId: string; onClose: () => void; onOpenFull: () => void }) {
  const data = useLoad(async () => {
    const [o, ev] = await Promise.all([
      sb().from('orders_view').select('*').eq('id', orderId).single(),
      sb().from('order_events').select('*').eq('order_id', orderId).order('id', { ascending: false }).limit(4),
    ])
    if (o.error) throw o.error
    if (ev.error) throw ev.error
    return { order: o.data as Order, events: (ev.data as OrderEvent[]).reverse() }
  }, [orderId])
  useRealtime(ctx.groupId, ['orders', 'order_events'], (_t, p) => {
    const row = p.new as { id?: string; order_id?: string }
    if (row.id === orderId || row.order_id === orderId) data.reload()
  })
  const [status, setStatus] = useState('')

  if (data.error) return <Notice kind="error">Không tải được đơn.</Notice>
  if (!data.data) return <p className="text-slate-600">Đang tải…</p>
  const { order, events } = data.data
  const done = order.status === 'COMPLETED'
  const act = async (name: string, args: Record<string, unknown>) => {
    await rpc(name, { p_order: orderId, ...args })
    if (name === 'change_status') void pushStatusLine(ctx, { id: orderId, code: order.code }, order.status, String(args.p_status))
    data.reload()
  }
  const next = STATUSES.filter((s) => s.code !== 'COMPLETED' && s.code !== order.status)
  const chosen = status && next.some((s) => s.code === status) ? status : (next[0]?.code ?? '')

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-600">{order.code}</span>
        <StatusBadge code={order.status} />
        <AttentionBadge reason={order.attention_reason} />
        <Button onClick={onClose} className="ml-auto">
          Đóng
        </Button>
      </div>
      <div className="font-semibold">{order.goods}</div>
      <div className="text-sm text-slate-700">
        {order.weight_kg} kg · {order.packages} kiện · giao {fmtDay(order.delivery_at)}
      </div>
      <div className="text-sm text-slate-600">
        {order.assignee_id ? ctx.nameOf(order.assignee_id) : 'Chưa giao'} · cập nhật {ago(order.last_activity_at)}
      </div>

      {!done && ctx.canWork && (
        <>
          <NoteAction label="Ghi chú (bắt buộc khi lùi trạng thái)" button="Cập nhật trạng thái" kind="primary" onSubmit={(note) => act('change_status', { p_status: chosen, p_note: note || null })}>
            <Field label="Trạng thái mới">
              <select className={inputClass} value={chosen} onChange={(e) => setStatus(e.target.value)}>
                {next.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.icon} {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </NoteAction>
          <NoteAction label="Order Note" button="Ghi chú" required onSubmit={(note) => act('add_note', { p_note: note })} />
        </>
      )}

      {events.length > 0 && (
        <ol className="space-y-1">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-teal-600 pl-3 text-sm">
              <span className="text-slate-600">
                {fmtTime(e.created_at)} — {ctx.nameOf(e.actor_id)}:{' '}
              </span>
              {e.type === 'STATUS_CHANGED' ? `${statusOf(e.from_status ?? '').label} → ${statusOf(e.to_status ?? '').label}` : e.type}
              {e.note && e.type !== 'ASSIGNED' && <div className="whitespace-pre-wrap break-words text-slate-700">{e.note}</div>}
            </li>
          ))}
        </ol>
      )}

      <Button onClick={onOpenFull} kind="primary" className="w-full sm:w-auto">
        Mở đầy đủ
      </Button>
    </Card>
  )
}
