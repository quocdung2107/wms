import { useEffect, useRef, useState } from 'react'
import { Button, Notice, useLoad } from '../../shared/ui/ui'
import { AlbumGrid } from './AlbumGrid'
import { errText, pushStatusLine, rpc, STATUS_LINE_PREFIX, sb } from './api'
import { fmtDay, fmtTime } from './format'
import { Composer } from './Composer'
import { AttentionBadge, StatusBadge, statusOf } from './status'
import { nextStatus } from './statusFlow'
import type { Attachment, GroupCtx, Message, Order } from './types'
import { useRealtime } from './useRealtime'

type Undo = { orderId: string; prev: string; until: number }
const UNDO_MS = 6000

function OrderCard({
  order,
  loading,
  onOpen,
  onQuick,
  quickBusy,
}: {
  order: Order | undefined
  loading: boolean
  onOpen?: (id: string) => void
  onQuick?: (order: Order, next: string) => void
  quickBusy?: boolean
}) {
  if (!order) return <div className="inline-block rounded-lg bg-white px-3 py-2 text-slate-500">{loading ? 'Đang tải đơn…' : 'Đơn không còn truy cập được.'}</div>
  const next = nextStatus(order.status)
  return (
    <div className={`w-full max-w-sm space-y-2 rounded-xl border bg-white p-3 text-left shadow-sm ${order.needs_attention ? 'border-red-400' : 'border-teal-600'}`}>
      <button type="button" disabled={!onOpen} onClick={() => onOpen?.(order.id)} className="block w-full space-y-1 text-left hover:bg-slate-50">
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
      {next && onQuick && (
        <Button kind="primary" className="w-full" disabled={quickBusy} onClick={() => onQuick(order, next)}>
          Bước tiếp theo: {statusOf(next).label}
        </Button>
      )}
    </div>
  )
}

/** Gắn ảnh đính kèm vào các message (message chữ không có ảnh thì để trống). */
async function withAttachments(msgs: Message[]): Promise<Message[]> {
  if (msgs.length === 0) return msgs
  const { data, error } = await sb()
    .from('message_attachments')
    .select('*')
    .in('message_id', msgs.map((m) => m.id))
    .order('position')
  if (error) throw error
  const by = new Map<number, Attachment[]>()
  for (const a of data as Attachment[]) by.set(a.message_id, [...(by.get(a.message_id) ?? []), a])
  return msgs.map((m) => (by.has(m.id) ? { ...m, attachments: by.get(m.id) } : m))
}

/** Chat chung của group (orderId = null) hoặc chat riêng trong một đơn. */
export function Chat({ ctx, orderId, onOpenOrder }: { ctx: GroupCtx; orderId: string | null; onOpenOrder?: (id: string) => void }) {
  const [extra, setExtra] = useState<Message[]>([])
  const [err, setErr] = useState('')
  const [ordersTick, setOrdersTick] = useState(0)
  const [quickBusy, setQuickBusy] = useState(false)
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const initial = useLoad(async () => {
    let q = sb().from('messages').select('*').eq('group_id', ctx.groupId)
    q = orderId ? q.eq('order_id', orderId) : q.is('order_id', null)
    const { data, error } = await q.order('id', { ascending: false }).limit(100)
    if (error) throw error
    return withAttachments((data as Message[]).reverse())
  }, [ctx.groupId, orderId])

  useRealtime(ctx.groupId, ['messages', 'orders'], (t, p) => {
    if (t === 'orders') {
      setOrdersTick((n) => n + 1)
      return
    }
    if (p.eventType !== 'INSERT') return
    const m = p.new as Message
    if ((m.order_id ?? null) !== orderId) return
    // Message tới trước ảnh: tải attachments rồi mới hiện (RPC cùng giao dịch nên ảnh đã có).
    void withAttachments([m])
      .catch(() => [m])
      .then(([mm]) => setExtra((x) => (x.some((y) => y.id === mm.id) ? x : [...x, mm])))
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

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  function armUndo(u: Undo | null) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo(u)
    if (u) undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  async function quick(order: Order, next: string) {
    if (quickBusy) return
    setErr('')
    setQuickBusy(true)
    try {
      await rpc('change_status', { p_order: order.id, p_status: next, p_note: null })
      void pushStatusLine(ctx, order, order.status, next)
      armUndo({ orderId: order.id, prev: order.status, until: Date.now() + UNDO_MS })
      setOrdersTick((n) => n + 1)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setQuickBusy(false)
    }
  }

  async function doUndo() {
    if (!undo || quickBusy) return
    const u = undo
    setErr('')
    setQuickBusy(true)
    try {
      await rpc('change_status', { p_order: u.orderId, p_status: u.prev, p_note: 'Hoàn tác' })
      void pushStatusLine(ctx, { id: u.orderId, code: cards.data?.get(u.orderId)?.code ?? '' }, cards.data?.get(u.orderId)?.status ?? u.prev, u.prev)
      armUndo(null)
      setOrdersTick((n) => n + 1)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setQuickBusy(false)
    }
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
            {m.shared_order_id && m.body.startsWith(STATUS_LINE_PREFIX) ? (
              <button type="button" disabled={!onOpenOrder} onClick={() => onOpenOrder?.(m.shared_order_id!)} className="inline-block max-w-full rounded-lg bg-slate-100 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-200">
                {m.body}
              </button>
            ) : m.shared_order_id ? (
              <OrderCard order={cards.data?.get(m.shared_order_id)} loading={cards.loading} onOpen={onOpenOrder} onQuick={quick} quickBusy={quickBusy} />
            ) : (
              <>
                {m.attachments && m.attachments.length > 0 && (
                  <div className={m.sender_id === ctx.me ? 'flex flex-col items-end gap-1' : 'flex flex-col items-start gap-1'}>
                    <AlbumGrid attachments={m.attachments} />
                  </div>
                )}
                {m.body && <div className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left ${m.sender_id === ctx.me ? 'bg-teal-100' : 'bg-white'}`}>{m.body}</div>}
              </>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      {undo && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-lg bg-slate-800 px-3 py-2 text-white">
          <span>Đã đổi trạng thái đơn.</span>
          <button type="button" disabled={quickBusy} onClick={() => void doUndo()} className="min-h-11 rounded-md px-3 font-semibold underline disabled:opacity-50">
            Hoàn tác
          </button>
        </div>
      )}
      <Composer ctx={ctx} orderId={orderId} />
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  )
}
