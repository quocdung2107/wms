import { useState } from 'react'
import { Card, Button, Field, inputClass, Notice } from '../../shared/ui/ui'
import { errText } from './api'
import { NoteAction } from './NoteAction'
import { STATUSES } from './status'
import type { GroupCtx, Order } from './types'

export function OrderActions({ ctx, order, act }: { ctx: GroupCtx; order: Order; act: (name: string, args: Record<string, unknown>) => Promise<void> }) {
  const done = order.status === 'COMPLETED'
  const [assignee, setAssignee] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [cust, setCust] = useState<{ name: string; addr: string } | null>(null)
  const [ship, setShip] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const nextStatuses = STATUSES.filter((s) => s.code !== 'COMPLETED' && s.code !== order.status)
  const chosenStatus = status && nextStatuses.some((s) => s.code === status) ? status : (nextStatuses[0]?.code ?? '')
  const assigneeValue = assignee ?? order.assignee_id ?? ''
  return (
    <>
      {!done && ctx.canWork && (
        <Card className="space-y-5">
          {ctx.canCoordinate && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                setMsg('')
                act('update_order_customer', { p_customer_name: cust?.name ?? order.customer_name, p_customer_address: cust?.addr ?? order.customer_address })
                  .then(() => setMsg('Đã lưu.'))
                  .catch((er) => setMsg(errText(er)))
              }}
            >
              <Field label="Người đặt hàng">
                <input className={inputClass} maxLength={100} value={cust?.name ?? order.customer_name} onChange={(e) => setCust({ name: e.target.value, addr: cust?.addr ?? order.customer_address })} />
              </Field>
              <Field label="Địa chỉ đặt hàng">
                <input className={inputClass} maxLength={300} value={cust?.addr ?? order.customer_address} onChange={(e) => setCust({ name: cust?.name ?? order.customer_name, addr: e.target.value })} />
              </Field>
              <Button type="submit">Lưu người đặt hàng</Button>
            </form>
          )}
          <div className="space-y-3">
            <Field label="Mã vận chuyển (gõ đè mã thật của hãng)">
              <input className={inputClass} maxLength={40} value={ship ?? order.shipment_code ?? ''} onChange={(e) => setShip(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {!order.shipment_code && (
                <Button
                  onClick={() => {
                    setMsg('')
                    act('set_shipment_code', { p_code: null })
                      .then(() => setShip(null))
                      .catch((er) => setMsg(errText(er)))
                  }}
                >
                  Tạo mã vận chuyển
                </Button>
              )}
              <Button
                disabled={!(ship ?? '').trim()}
                onClick={() => {
                  setMsg('')
                  act('set_shipment_code', { p_code: ship })
                    .then(() => {
                      setShip(null)
                      setMsg('Đã lưu mã vận chuyển.')
                    })
                    .catch((er) => setMsg(errText(er)))
                }}
              >
                Lưu mã
              </Button>
            </div>
          </div>
          {msg && <p className="text-sm text-slate-700">{msg}</p>}
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
    </>
  )
}
