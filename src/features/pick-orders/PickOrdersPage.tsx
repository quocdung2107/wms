import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'
import { createPickOrder, listPickOrders } from './api.ts'
import PickOrderDetail from './PickOrderDetail.tsx'

export default function PickOrdersPage() {
  const orders = useLoad(listPickOrders, [])
  const [openId, setOpenId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState('')

  if (openId !== null) return <PickOrderDetail id={openId} onBack={() => { setOpenId(null); orders.reload() }} />

  async function create() {
    try {
      const id = await createPickOrder({ name, order_ref: ref })
      setName('')
      setRef('')
      setErr('')
      setOpenId(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Tạo đơn picking</h2>
        <Field label="Tên / ghi chú (có thể để trống)">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mã đơn hàng DH-xxxx (có thể gắn sau)">
          <input className={inputClass} value={ref} placeholder="DH-0001" onChange={(e) => setRef(e.target.value)} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <Button kind="primary" onClick={create}>Tạo đơn (mã PK tự đánh số)</Button>
      </Card>
      {orders.error && <Notice kind="error">{orders.error}</Notice>}
      {!orders.loading && (orders.data?.length ?? 0) === 0 && <p className="text-slate-600">Chưa có đơn picking nào.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(orders.data ?? []).map((o) => (
          <Card key={o.id} className="space-y-1">
            <p className="text-lg font-bold">{o.code}{o.order_ref ? <span className="text-base font-normal"> · {o.order_ref}</span> : null}</p>
            {o.name && <p className="text-slate-700">{o.name}</p>}
            <p className="text-sm text-slate-500">{o.created_at}</p>
            <Button className="w-full" onClick={() => setOpenId(o.id)}>Mở</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
