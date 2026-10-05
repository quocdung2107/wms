import { useState } from 'react'
import { Button, Card, Notice, useLoad } from '../../shared/ui/ui'
import { carrierErr, listPendingClaims, listPendingSuggestions, reviewClaim, reviewSuggestion } from './api'
import type { Carrier } from './types'

const FIELDS: Record<string, string> = {
  name: 'Tên',
  description: 'Mô tả',
  regions: 'Khu vực',
  vehicle_types: 'Loại xe',
  phone: 'SĐT',
  email: 'Email',
  zalo: 'Zalo',
}
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')) || '—'

/** Màn duyệt đề xuất sửa; chỉ render cho admin hệ thống (CarriersPage kiểm is_system_admin). */
export function ReviewQueue({ carriers, onChanged, onBack }: { carriers: Carrier[]; onChanged: () => void; onBack: () => void }) {
  const q = useLoad(listPendingSuggestions, [])
  const cq = useLoad(listPendingClaims, [])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  async function act(id: string, approve: boolean) {
    setBusy(id)
    setErr('')
    try {
      await reviewSuggestion(id, approve)
      q.reload()
      if (approve) onChanged()
    } catch (e) {
      setErr(carrierErr(e))
    }
    setBusy('')
  }

  async function actClaim(id: string, approve: boolean) {
    setBusy(id)
    setErr('')
    try {
      await reviewClaim(id, approve)
      cq.reload()
      if (approve) onChanged()
    } catch (e) {
      setErr(carrierErr(e))
    }
    setBusy('')
  }

  return (
    <div className="space-y-4">
      <Button onClick={onBack}>← Danh sách</Button>
      {err && <Notice kind="error">{err}</Notice>}
      <h2 className="text-xl font-bold">Duyệt yêu cầu claim</h2>
      {cq.loading && <p className="text-slate-600">Đang tải…</p>}
      {cq.error && <Notice kind="error">Không tải được yêu cầu claim.</Notice>}
      {cq.data && cq.data.length === 0 && <p className="text-slate-600">Không có yêu cầu claim nào đang chờ.</p>}
      <ul className="space-y-3">
        {cq.data?.map((cl) => (
          <li key={cl.id}>
            <Card className="space-y-2">
              <p className="font-semibold">{carriers.find((c) => c.id === cl.carrier_id)?.name ?? 'Nhà vận tải không còn tồn tại'}</p>
              <p className="text-sm">Liên hệ công ty: {cl.contact}</p>
              {cl.note && <p className="whitespace-pre-line text-sm text-slate-600">{cl.note}</p>}
              <div className="flex flex-wrap gap-2">
                <Button kind="primary" disabled={!!busy} onClick={() => void actClaim(cl.id, true)}>Duyệt</Button>
                <Button kind="danger" disabled={!!busy} onClick={() => void actClaim(cl.id, false)}>Từ chối</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-bold">Duyệt đề xuất sửa</h2>
      {q.loading && <p className="text-slate-600">Đang tải…</p>}
      {q.error && <Notice kind="error">Không tải được đề xuất.</Notice>}
      {q.data && q.data.length === 0 && <p className="text-slate-600">Không có đề xuất nào đang chờ.</p>}
      <ul className="space-y-3">
        {q.data?.map((s) => {
          const cur = carriers.find((c) => c.id === s.carrier_id)
          return (
            <li key={s.id}>
              <Card className="space-y-2">
                <p className="font-semibold">{cur?.name ?? 'Nhà vận tải không còn tồn tại'}</p>
                <dl className="space-y-1 text-sm">
                  {Object.entries(s.proposed).map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-medium text-slate-600">{FIELDS[k] ?? k}</dt>
                      <dd>
                        <span className="text-slate-500 line-through">{show(cur?.[k as keyof Carrier])}</span> → <span>{show(v)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button kind="primary" disabled={!!busy} onClick={() => void act(s.id, true)}>Duyệt</Button>
                  <Button kind="danger" disabled={!!busy} onClick={() => void act(s.id, false)}>Từ chối</Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
