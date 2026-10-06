import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { Chat } from './Chat'
import { errText, rpc, sb } from './api'
import { ago, fmtDay, fmtTime } from './format'
import { NoteAction } from './NoteAction'
import { AttentionBadge, StatusBadge, STATUSES, statusOf } from './status'
import type { GroupCtx, Order, OrderEvent } from './types'
import { useRealtime } from './useRealtime'

function describe(e: OrderEvent, ctx: GroupCtx): string {
  switch (e.type) {
    case 'CREATED':
      return 'Tạo đơn'
    case 'STATUS_CHANGED':
      return `Đổi trạng thái: ${statusOf(e.from_status ?? '').label} → ${statusOf(e.to_status ?? '').label}`
    case 'ASSIGNED':
      return e.note ? `Giao cho ${ctx.nameOf(e.note)}` : 'Bỏ người xử lý'
    case 'NOTE':
      return 'Ghi chú'
    case 'ISSUE_OPENED':
      return 'Báo sự cố'
    case 'ISSUE_RESOLVED':
      return 'Đã xử lý sự cố'
    case 'COMPLETED':
      return 'Hoàn thành'
    case 'REOPENED':
      return 'Mở lại đơn'
    default:
      return e.type
  }
}

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

  const [assignee, setAssignee] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [shared, setShared] = useState('')

  if (data.error) return <Notice kind="error">Không tải được đơn.</Notice>
  if (!data.data) return <p className="text-slate-600">Đang tải…</p>
  const { order, events } = data.data
  const done = order.status === 'COMPLETED'
  const act = async (name: string, args: Record<string, unknown>) => {
    await rpc(name, { p_order: orderId, ...args })
    data.reload()
  }
  const nextStatuses = STATUSES.filter((s) => s.code !== 'COMPLETED' && s.code !== order.status)
  const chosenStatus = status && nextStatuses.some((s) => s.code === status) ? status : (nextStatuses[0]?.code ?? '')
  const assigneeValue = assignee ?? order.assignee_id ?? ''

  return (
    <div className="space-y-4">
      <Button onClick={onClose} className={backAlways ? '' : 'lg:hidden'}>
        {backLabel}
      </Button>

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
                const { error } = await sb().from('messages').insert({ group_id: ctx.groupId, sender_id: ctx.me, shared_order_id: orderId, body: `${order.code} — ${order.goods}`.slice(0, 2000) })
                setShared(error ? errText(error) : 'Đã gửi đơn vào chat.')
              }}
            >
              💬 Gửi đơn vào chat
            </Button>
            {shared && <span className="text-sm text-slate-700">{shared}</span>}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Người xử lý: <b>{order.assignee_id ? ctx.nameOf(order.assignee_id) : 'chưa giao'}</b> · Tạo bởi {ctx.nameOf(order.created_by)} · Cập nhật {ago(order.last_activity_at)}
        </p>
      </Card>

      {!done && ctx.canWork && (
        <Card className="space-y-5">
          <NoteAction label="Ghi chú (bắt buộc khi lùi trạng thái)" button="Cập nhật trạng thái" kind="primary" onSubmit={(note) => act('change_status', { p_status: chosenStatus, p_note: note || null })}>
            <Field label="Trạng thái mới">
              <select className={inputClass} value={chosenStatus} onChange={(e) => setStatus(e.target.value)}>
                {nextStatuses.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.icon} {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </NoteAction>

          {ctx.canCoordinate && (
            <NoteAction label="Ghi chú giao việc (không bắt buộc)" button="Giao đơn" onSubmit={() => act('assign_order', { p_assignee: assigneeValue || null })}>
              <Field label="Người xử lý">
                <select className={inputClass} value={assigneeValue} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">— chưa giao —</option>
                  {ctx.members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </NoteAction>
          )}

          <NoteAction label="Thêm ghi chú vào timeline" button="Ghi chú" required onSubmit={(note) => act('add_note', { p_note: note })} />
        </Card>
      )}

      {!done && (
        <Card className="space-y-3">
          {order.issue_open ? (
            ctx.canWork ? (
              <NoteAction label="Ghi chú xử lý (không bắt buộc)" button="Đã xử lý sự cố" onSubmit={(note) => act('resolve_issue', { p_note: note || null })} />
            ) : (
              <Notice kind="warn">Đơn đang có sự cố, chờ người có vai trò xử lý.</Notice>
            )
          ) : (
            <NoteAction label="Mô tả sự cố" button="Báo sự cố" kind="danger" required onSubmit={(note) => act('open_issue', { p_note: note })} />
          )}
        </Card>
      )}

      {!done && ctx.canCoordinate && (
        <Card>
          <NoteAction label="Ghi chú hoàn thành (không bắt buộc)" button="Hoàn thành đơn" kind="primary" confirmText="Hoàn thành đơn? Đơn sẽ rời danh sách đang mở." onSubmit={(note) => act('complete_order', { p_note: note || null })} />
        </Card>
      )}
      {done && ctx.isAdmin && (
        <Card>
          <NoteAction label="Lý do mở lại" button="Mở lại đơn" required onSubmit={(note) => act('reopen_order', { p_note: note })} />
        </Card>
      )}

      <Card className="space-y-2">
        <h3 className="text-lg font-semibold">Timeline</h3>
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-teal-600 pl-3">
              <div className="text-sm text-slate-600">
                {fmtTime(e.created_at)} — {ctx.nameOf(e.actor_id)}
              </div>
              <div className="font-medium">{describe(e, ctx)}</div>
              {e.note && e.type !== 'ASSIGNED' && <div className="whitespace-pre-wrap break-words text-slate-700">{e.note}</div>}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="space-y-2">
        <h3 className="text-lg font-semibold">Trao đổi trong đơn</h3>
        <Chat ctx={ctx} orderId={orderId} />
      </Card>
    </div>
  )
}
