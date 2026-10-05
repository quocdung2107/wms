import { useEffect, useState } from 'react'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { errText, rpc, sb } from './api'
import { ago } from './format'
import { OrderDetail } from './OrderDetail'
import { AttentionBadge, StatusBadge, STATUSES } from './status'
import type { GroupCtx, Order } from './types'
import { useRealtime } from './useRealtime'

function NewOrderForm({ ctx, onCreated }: { ctx: GroupCtx; onCreated: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setErr('')
    try {
      const id = (await rpc('create_order', { p_group: ctx.groupId, p_code: code, p_title: title, p_details: details })) as string
      onCreated(id)
    } catch (e) {
      setErr(errText(e))
    }
    setBusy(false)
  }

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <h2 className="text-lg font-semibold">Tạo đơn mới</h2>
        <Field label="Mã đơn (để trống = tự sinh DH-0001…)">
          <input className={inputClass} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Tiêu đề">
          <input className={inputClass} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Chi tiết (hàng, số lượng, điểm lấy/giao, ngày…)">
          <textarea className={inputClass} rows={4} maxLength={4000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <Button type="submit" kind="primary" disabled={busy || !title.trim()}>
          Tạo đơn
        </Button>
        {err && <Notice kind="error">{err}</Notice>}
      </form>
    </Card>
  )
}

/** Active Orders: đếm theo trạng thái, Cần chú ý lên đầu, lọc theo người xử lý; Lịch sử = đơn đã hoàn thành. */
export function Board({ ctx }: { ctx: GroupCtx }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [assignee, setAssignee] = useState('all')
  const [status, setStatus] = useState('all')
  const [history, setHistory] = useState(false)

  const orders = useLoad(async () => {
    const { data, error } = await sb().from('orders_view').select('*').eq('group_id', ctx.groupId).order('last_activity_at', { ascending: false }).limit(500)
    if (error) throw error
    return data as Order[]
  }, [ctx.groupId])
  useRealtime(ctx.groupId, ['orders'], () => orders.reload())
  // Cần chú ý "Quá 24h" tính lúc truy vấn → tải lại định kỳ để nhãn không bị cũ.
  useEffect(() => {
    const t = setInterval(() => orders.reload(), 5 * 60 * 1000)
    return () => clearInterval(t)
  })

  const all = orders.data ?? []
  const active = all.filter((o) => o.status !== 'COMPLETED')
  const counts = (code: string) => active.filter((o) => o.status === code).length
  const attention = active.filter((o) => o.needs_attention).length

  let shown = all.filter((o) => (history ? o.status === 'COMPLETED' : o.status !== 'COMPLETED'))
  if (!history && status === 'ATTENTION') shown = shown.filter((o) => o.needs_attention)
  else if (!history && status !== 'all') shown = shown.filter((o) => o.status === status)
  if (assignee === 'me') shown = shown.filter((o) => o.assignee_id === ctx.me)
  else if (assignee === 'none') shown = shown.filter((o) => !o.assignee_id)
  else if (assignee !== 'all') shown = shown.filter((o) => o.assignee_id === assignee)
  if (!history) shown = [...shown].sort((a, b) => Number(b.needs_attention) - Number(a.needs_attention))

  const chip = (key: string, label: string, n: number, extra = '') => (
    <button
      key={key}
      onClick={() => setStatus(status === key ? 'all' : key)}
      aria-pressed={status === key}
      className={`min-h-11 rounded-lg border px-3 text-base ${status === key ? 'border-teal-700 bg-teal-50 font-semibold' : 'border-slate-300 bg-white'} ${extra}`}
    >
      {label} <b>{n}</b>
    </button>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className={`space-y-3 ${openId ? 'hidden lg:block' : ''}`}>
        <div className="flex flex-wrap gap-2">
          <Button kind={history ? 'secondary' : 'primary'} onClick={() => setHistory(false)}>
            Đang mở ({active.length})
          </Button>
          <Button kind={history ? 'primary' : 'secondary'} onClick={() => setHistory(true)}>
            Lịch sử ({all.length - active.length})
          </Button>
          {ctx.canCoordinate && (
            <Button onClick={() => setCreating((c) => !c)} className="ml-auto">
              {creating ? 'Đóng' : '+ Tạo đơn'}
            </Button>
          )}
        </div>

        {creating && (
          <NewOrderForm
            ctx={ctx}
            onCreated={(id) => {
              setCreating(false)
              setOpenId(id)
              orders.reload()
            }}
          />
        )}

        {!history && (
          <div className="flex flex-wrap gap-2">
            {attention > 0 && chip('ATTENTION', '⚠️ Cần chú ý', attention, 'text-red-800')}
            {STATUSES.filter((s) => s.code !== 'COMPLETED').map((s) => chip(s.code, `${s.icon} ${s.label}`, counts(s.code)))}
          </div>
        )}

        <Field label="Người xử lý">
          <select className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="me">Của tôi</option>
            <option value="none">Chưa giao</option>
            {ctx.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        {orders.error && <Notice kind="error">Không tải được danh sách đơn.</Notice>}
        {orders.data && shown.length === 0 && <p className="text-slate-600">{history ? 'Chưa có đơn hoàn thành.' : 'Không có đơn đang mở theo bộ lọc này.'}</p>}
        <ul className="space-y-2">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => setOpenId(o.id)}
                className={`w-full space-y-1 rounded-xl bg-white p-3 text-left shadow-sm hover:bg-slate-50 ${openId === o.id ? 'ring-2 ring-teal-600' : ''} ${o.needs_attention ? 'border-l-4 border-red-500' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-slate-600">{o.code}</span>
                  <StatusBadge code={o.status} />
                  <AttentionBadge reason={o.attention_reason} />
                </div>
                <div className="font-semibold">{o.title}</div>
                <div className="text-sm text-slate-600">
                  {o.assignee_id ? ctx.nameOf(o.assignee_id) : 'Chưa giao'} · cập nhật {ago(o.last_activity_at)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={openId ? '' : 'hidden lg:block'}>
        {openId ? <OrderDetail key={openId} ctx={ctx} orderId={openId} onClose={() => setOpenId(null)} /> : <p className="text-slate-500">Chọn một đơn để xem chi tiết.</p>}
      </div>
    </div>
  )
}
