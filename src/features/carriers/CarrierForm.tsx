import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { addCarrier, carrierErr, suggestCarrierUpdate, updateOwnCarrier, type CarrierInput } from './api'
import type { Carrier } from './types'

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Không có `carrier`: thêm mới (community). Có `carrier`: gửi đề xuất sửa, chờ admin duyệt; `direct` (chủ đã claim): sửa thẳng. */
export function CarrierForm({ carrier, direct, onDone, onCancel }: { carrier?: Carrier; direct?: boolean; onDone: (msg: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: carrier?.name ?? '',
    description: carrier?.description ?? '',
    regions: carrier?.regions.join(', ') ?? '',
    vehicles: carrier?.vehicle_types.join(', ') ?? '',
    phone: carrier?.phone ?? '',
    email: carrier?.email ?? '',
    zalo: carrier?.zalo ?? '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit() {
    setBusy(true)
    setErr('')
    const input: CarrierInput = {
      name: f.name.trim(),
      description: f.description.trim(),
      regions: list(f.regions),
      vehicle_types: list(f.vehicles),
      phone: f.phone.trim(),
      email: f.email.trim(),
      zalo: f.zalo.trim(),
    }
    try {
      if (carrier && direct) {
        await updateOwnCarrier(carrier.id, input)
        onDone('Đã lưu thay đổi.')
      } else if (carrier) {
        await suggestCarrierUpdate(carrier.id, input)
        onDone('Đã gửi đề xuất sửa. Thông tin sẽ đổi sau khi admin duyệt.')
      } else {
        await addCarrier(input)
        onDone('Đã thêm nhà vận tải (nguồn Cộng đồng).')
      }
    } catch (e) {
      setErr(carrierErr(e))
    }
    setBusy(false)
  }

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="text-lg font-semibold">{carrier ? `${direct ? 'Sửa' : 'Đề xuất sửa'}: ${carrier.name}` : 'Thêm nhà vận tải'}</h2>
        {carrier && !direct && <Notice>Đề xuất được gửi cho admin duyệt; thông tin hiện tại chưa đổi.</Notice>}
        <Field label="Tên *">
          <input className={inputClass} required maxLength={120} value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Mô tả">
          <textarea className={inputClass} rows={3} maxLength={1000} value={f.description} onChange={set('description')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Khu vực (cách nhau bằng dấu phẩy)">
            <input className={inputClass} value={f.regions} onChange={set('regions')} />
          </Field>
          <Field label="Loại xe (cách nhau bằng dấu phẩy)">
            <input className={inputClass} value={f.vehicles} onChange={set('vehicles')} />
          </Field>
          <Field label="Số điện thoại">
            <input className={inputClass} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Zalo">
            <input className={inputClass} value={f.zalo} onChange={set('zalo')} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={f.email} onChange={set('email')} />
          </Field>
        </div>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button kind="primary" type="submit" disabled={busy || !f.name.trim()}>
            {direct ? 'Lưu' : carrier ? 'Gửi đề xuất' : 'Thêm'}
          </Button>
          <Button onClick={onCancel}>Huỷ</Button>
        </div>
      </form>
    </Card>
  )
}
