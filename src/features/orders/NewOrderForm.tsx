import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { errText, rpc } from './api'
import { localToIso } from './format'
import type { GroupCtx } from './types'

export function NewOrderForm({ ctx, onCreated }: { ctx: GroupCtx; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ code: '', goods: '', weight: '', packages: '', pickupAt: '', deliveryAt: '', pickupAddr: '', deliveryAddr: '', contact: '', phone: '', urgent: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const ready = f.goods.trim() && Number(f.weight) > 0 && Number(f.packages) > 0 && f.pickupAt && f.deliveryAt

  async function create() {
    if (f.deliveryAt < f.pickupAt) {
      setErr('Thời gian giao phải sau thời gian nhận.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const id = (await rpc('create_order', {
        p_group: ctx.groupId,
        p_code: f.code,
        p_goods: f.goods,
        p_weight_kg: Number(f.weight),
        p_packages: Math.round(Number(f.packages)),
        p_pickup_at: localToIso(f.pickupAt),
        p_delivery_at: localToIso(f.deliveryAt),
        p_pickup_address: f.pickupAddr,
        p_delivery_address: f.deliveryAddr,
        p_contact_name: f.contact,
        p_contact_phone: f.phone,
        p_priority: f.urgent ? 'URGENT' : 'NORMAL',
      })) as string
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
        <p className="text-sm text-slate-600">Các ô có dấu * là bắt buộc.</p>
        <Field label="Mặt hàng *">
          <input className={inputClass} required maxLength={200} value={f.goods} onChange={set('goods')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tải trọng (kg) *">
            <input className={inputClass} required type="number" inputMode="decimal" min="0.01" step="0.01" value={f.weight} onChange={set('weight')} />
          </Field>
          <Field label="Số kiện *">
            <input className={inputClass} required type="number" inputMode="numeric" min="1" step="1" value={f.packages} onChange={set('packages')} />
          </Field>
          <Field label="Thời gian nhận hàng *">
            <input className={inputClass} required type="datetime-local" value={f.pickupAt} onChange={set('pickupAt')} />
          </Field>
          <Field label="Thời gian giao hàng *">
            <input className={inputClass} required type="datetime-local" min={f.pickupAt} value={f.deliveryAt} onChange={set('deliveryAt')} />
          </Field>
          <Field label="Điểm nhận">
            <input className={inputClass} maxLength={300} value={f.pickupAddr} onChange={set('pickupAddr')} />
          </Field>
          <Field label="Điểm giao">
            <input className={inputClass} maxLength={300} value={f.deliveryAddr} onChange={set('deliveryAddr')} />
          </Field>
          <Field label="Người liên hệ">
            <input className={inputClass} maxLength={100} value={f.contact} onChange={set('contact')} />
          </Field>
          <Field label="SĐT liên hệ">
            <input className={inputClass} type="tel" inputMode="tel" maxLength={30} value={f.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="Mã đơn (để trống = tự sinh DH-0001…)">
          <input className={inputClass} maxLength={40} value={f.code} onChange={set('code')} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-base">
          <input type="checkbox" className="size-5" checked={f.urgent} onChange={(e) => setF((x) => ({ ...x, urgent: e.target.checked }))} />
          🔥 Đơn gấp
        </label>
        <Button type="submit" kind="primary" disabled={busy || !ready}>
          Tạo đơn
        </Button>
        {err && <Notice kind="error">{err}</Notice>}
      </form>
    </Card>
  )
}
