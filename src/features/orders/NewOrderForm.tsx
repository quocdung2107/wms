import { useEffect, useState } from 'react'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { Icon } from '../../shared/ui/icons'
import { errText, pushOrderCard, rpc } from './api'
import { localToIso } from './format'
import type { GroupCtx } from './types'
import { noticeDialog } from '../../shared/ui/Dialog'
import type { Customer } from '../../shared/inventory/customers'

/** Ô chọn khách: danh sách từ SQLite cục bộ; máy không có danh sách thì nhập tay mã. Không bao giờ ném lỗi. */
export function CustomerPicker({ value, onChange }: { value: string; onChange: (code: string, c?: Customer) => void }) {
  const [list, setList] = useState<Customer[]>([])
  useEffect(() => {
    let alive = true
    import('../../shared/inventory/repo').then((r) => r.listCustomers()).then((l) => alive && setList(l), () => {})
    return () => { alive = false }
  }, [])
  const known = list.some((c) => c.code.trim().toUpperCase() === value.trim().toUpperCase())
  return (
    <Field label="Khách hàng (mã KH, có thể để trống)">
      {list.length > 0 ? (
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value, list.find((c) => c.code === e.target.value))}>
          <option value="">— Chưa chọn —</option>
          {value && !known && <option value={value}>{value}</option>}
          {list.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </select>
      ) : (
        <input className={inputClass} maxLength={50} placeholder="Nhập mã khách (máy này chưa có danh sách)" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

export function NewOrderForm({ ctx, onCreated }: { ctx: GroupCtx; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ code: '', goods: '', weight: '', packages: '', pickupAt: '', deliveryAt: '', pickupAddr: '', deliveryAddr: '', contact: '', phone: '', customer: '', customerAddr: '', customerCode: '', urgent: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wMsg, setWMsg] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const ready = f.goods.trim() && Number(f.weight) > 0 && Number(f.packages) > 0 && f.pickupAt && f.deliveryAt

  async function fillWeight() {
    setWMsg('')
    const ref = f.code.trim()
    if (!ref) return setWMsg('Nhập mã đơn (DH-xxxx) trước để tìm lệnh lấy hàng.')
    try {
      const [api, sum, repo] = await Promise.all([import('../pick-orders/api'), import('../pick-orders/summary'), import('../../shared/inventory/repo')])
      const list = sum.matchPickOrders(await api.listPickOrders(), ref)
      if (list.length === 0) return setWMsg(`Máy này chưa có lệnh lấy hàng nào gắn mã ${ref}.`)
      const weights = await repo.getSkuWeights()
      const groups = await Promise.all(list.map(async (p) => ({ lines: await api.listLines(p.id), picks: await api.listOrderPicks(p.id) })))
      const { totalKg, missing } = sum.sumPickWeight(groups, weights)
      if (!(totalKg > 0)) return setWMsg(`Chưa tính được khối lượng từ ${list.length} lệnh lấy hàng (chưa lấy hàng hoặc thiếu KL SKU).`)
      setF((x) => ({ ...x, weight: String(Math.round(totalKg * 100) / 100) }))
      setWMsg(`Đã điền từ ${list.length} lệnh lấy hàng${missing > 0 ? `; ${missing} SKU chưa có KL nên chưa tính` : ''}. Có thể sửa tay.`)
    } catch {
      setWMsg('Không đọc được dữ liệu lệnh lấy hàng trên máy này.')
    }
  }

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
        p_customer_name: f.customer,
        p_customer_address: f.customerAddr,
        // Chỉ gửi khi có mã: tương thích RPC cũ (chưa có p_customer_code).
        ...(f.customerCode.trim() ? { p_customer_code: f.customerCode.trim() } : {}),
      })) as string
      try {
        await pushOrderCard(ctx, { id, code: f.code || id, goods: f.goods })
      } catch {
        await noticeDialog('Đã tạo đơn, nhưng chưa thêm được thẻ đơn vào chat. Có thể gửi lại từ màn chi tiết đơn.')
      }
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
          <div className="space-y-1 sm:col-span-2">
            <Button onClick={() => void fillWeight()}>Lấy KL từ lệnh lấy hàng</Button>
            {wMsg && <p className="text-sm text-slate-700">{wMsg}</p>}
          </div>
          <Field label="Số kiện *">
            <input className={inputClass} required type="number" inputMode="numeric" min="1" step="1" value={f.packages} onChange={set('packages')} />
          </Field>
          <Field label="Thời gian nhận hàng *">
            <input className={inputClass} required type="datetime-local" value={f.pickupAt} onChange={set('pickupAt')} />
          </Field>
          <Field label="Thời gian giao hàng *">
            <input className={inputClass} required type="datetime-local" min={f.pickupAt} value={f.deliveryAt} onChange={set('deliveryAt')} />
          </Field>
          <div className="sm:col-span-2">
            <CustomerPicker
              value={f.customerCode}
              onChange={(code, c) => setF((x) => ({ ...x, customerCode: code, customer: c && !x.customer ? c.name : x.customer, customerAddr: c && !x.customerAddr ? c.address : x.customerAddr }))}
            />
          </div>
          <Field label="Người đặt hàng">
            <input className={inputClass} maxLength={100} value={f.customer} onChange={set('customer')} />
          </Field>
          <Field label="Địa chỉ đặt hàng">
            <input className={inputClass} maxLength={300} value={f.customerAddr} onChange={set('customerAddr')} />
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
          <Icon name="flame" /> Đơn gấp
        </label>
        <Button type="submit" kind="primary" disabled={busy || !ready}>
          Tạo đơn
        </Button>
        {err && <Notice kind="error">{err}</Notice>}
      </form>
    </Card>
  )
}
