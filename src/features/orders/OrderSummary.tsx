import { useState } from 'react'
import type { PickOrder } from '../pick-orders/api'
import { Button, Card, inputClass } from '../../shared/ui/ui'
import { errText, pushOrderCard, sb } from './api'
import { ago, fmtDay } from './format'
import { AttentionBadge, StatusBadge } from './status'
import type { GroupCtx, Order } from './types'

export function OrderSummary({ ctx, order, orderId }: { ctx: GroupCtx; order: Order; orderId: string }) {
  const [shared, setShared] = useState('')
  const [pk, setPk] = useState<{ list: PickOrder[]; sel: number } | null>(null)
  const [pkMsg, setPkMsg] = useState('')
  return (
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-600">{order.code}</span>
          <StatusBadge code={order.status} />
          {order.priority === 'URGENT' && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-medium text-white">🔥 Gấp</span>}
          <AttentionBadge reason={order.attention_reason} />
        </div>
        <h2 className="text-xl font-bold">{order.goods}</h2>
        <dl className="grid gap-x-4 gap-y-1 text-slate-800 sm:grid-cols-2">
          <div>
            Tải trọng: <b>{order.weight_kg} kg</b>
          </div>
          <div>
            Số kiện: <b>{order.packages}</b>
          </div>
          <div>
            Nhận hàng: <b>{fmtDay(order.pickup_at)}</b>
            {order.pickup_address && ` · ${order.pickup_address}`}
          </div>
          <div>
            Giao hàng: <b>{fmtDay(order.delivery_at)}</b>
            {order.delivery_address && ` · ${order.delivery_address}`}
          </div>
          {order.customer_name && (
            <div>
              Người đặt hàng: <b>{order.customer_name}</b>
            </div>
          )}
          {order.customer_address && <div>Địa chỉ đặt hàng: {order.customer_address}</div>}
          {order.shipment_code && (
            <div>
              Mã vận chuyển: <b className="font-mono">{order.shipment_code}</b>
            </div>
          )}
          {(order.contact_name || order.contact_phone) && (
            <div>
              Liên hệ: <b>{order.contact_name}</b>{' '}
              {order.contact_phone && (
                <a className="text-teal-800 underline" href={`tel:${order.contact_phone}`}>
                  {order.contact_phone}
                </a>
              )}
            </div>
          )}
        </dl>
        {ctx.canWork && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={async () => {
                try {
                  await pushOrderCard(ctx, { id: orderId, code: order.code, goods: order.goods })
                  setShared('Đã gửi đơn vào chat.')
                } catch (e) {
                  setShared(errText(e))
                }
              }}
            >
              💬 Gửi đơn vào chat
            </Button>
            {shared && <span className="text-sm text-slate-700">{shared}</span>}
            <Button
              onClick={async () => {
                setPkMsg('')
                try {
                  const [api, sum] = await Promise.all([import('../pick-orders/api'), import('../pick-orders/summary')])
                  const list = sum.matchPickOrders(await api.listPickOrders(), order.code)
                  if (list.length === 0) return setPkMsg(`Máy này chưa có đơn picking nào gắn mã ${order.code}.`)
                  if (list.length > 1 && !pk) return setPk({ list, sel: list[0].id })
                  const chosen = list.find((p) => p.id === pk?.sel) ?? list[0]
                  const [lines, picks] = await Promise.all([api.listLines(chosen.id), api.listOrderPicks(chosen.id)])
                  const body = sum.buildPickSummary({ pickCode: chosen.code, orderCode: order.code, customerName: order.customer_name, customerAddress: order.customer_address, shipmentCode: order.shipment_code, lines, picks })
                  const { error } = await sb().from('messages').insert({ group_id: ctx.groupId, order_id: orderId, sender_id: ctx.me, body })
                  setPk(null)
                  setPkMsg(error ? errText(error) : `Đã gửi tổng hợp ${chosen.code} vào chat đơn.`)
                } catch {
                  setPkMsg('Không đọc được dữ liệu picking trên máy này.')
                }
              }}
            >
              📋 Gửi tổng hợp picking
            </Button>
            {pk && (
              <select className={inputClass} value={pk.sel} onChange={(e) => setPk({ ...pk, sel: Number(e.target.value) })}>
                {pk.list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.name}
                  </option>
                ))}
              </select>
            )}
            {pkMsg && <span className="text-sm text-slate-700">{pkMsg}</span>}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Người xử lý: <b>{order.assignee_id ? ctx.nameOf(order.assignee_id) : 'chưa giao'}</b> · Tạo bởi {ctx.nameOf(order.created_by)} · Cập nhật {ago(order.last_activity_at)}
        </p>
      </Card>
  )
}
