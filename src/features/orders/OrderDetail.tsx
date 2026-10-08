import { Button, Card, Notice, useLoad } from '../../shared/ui/ui'
import { Chat } from './Chat'
import { pushStatusLine, rpc, sb } from './api'
import { OrderActions } from './OrderActions'
import { OrderSummary } from './OrderSummary'
import { OrderTimeline } from './OrderTimeline'
import type { GroupCtx, Order, OrderEvent } from './types'
import { useRealtime } from './useRealtime'

export function OrderDetail({ ctx, orderId, onClose, backLabel = '← Danh sách đơn', backAlways = false }: { ctx: GroupCtx; orderId: string; onClose: () => void; backLabel?: string; backAlways?: boolean }) {
  const data = useLoad(async () => {
    const [o, ev] = await Promise.all([
      sb().from('orders_view').select('*').eq('id', orderId).single(),
      sb().from('order_events').select('*').eq('order_id', orderId).order('id', { ascending: true }),
    ])
    if (o.error) throw o.error
    if (ev.error) throw ev.error
    return { order: o.data as Order, events: ev.data as OrderEvent[] }
  }, [orderId])
  useRealtime(ctx.groupId, ['orders', 'order_events'], (_t, p) => {
    const row = p.new as { id?: string; order_id?: string }
    if (row.id === orderId || row.order_id === orderId) data.reload()
  })

  if (data.error) return <Notice kind="error">Không tải được đơn.</Notice>
  if (!data.data) return <p className="text-slate-600">Đang tải…</p>
  const { order, events } = data.data
  const act = async (name: string, args: Record<string, unknown>) => {
    await rpc(name, { p_order: orderId, ...args })
    if (name === 'change_status') void pushStatusLine(ctx, { id: orderId, code: order.code }, order.status, String(args.p_status))
    data.reload()
  }

  return (
    <div className="space-y-4">
      <Button onClick={onClose} className={backAlways ? '' : 'lg:hidden'}>
        {backLabel}
      </Button>

      <OrderSummary ctx={ctx} order={order} orderId={orderId} />
      <OrderActions ctx={ctx} order={order} act={act} />
      <OrderTimeline ctx={ctx} events={events} />

      <Card className="space-y-2">
        <h3 className="text-lg font-semibold">Trao đổi trong đơn</h3>
        <Chat ctx={ctx} orderId={orderId} />
      </Card>
    </div>
  )
}
