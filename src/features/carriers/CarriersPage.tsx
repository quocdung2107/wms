import { useMemo, useState } from 'react'
import { supabase } from '../../shared/supabase/client'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { useSession } from '../orders/useSession'
import { isSystemAdmin, listCarriers } from './api'
import { ClaimForm } from './ClaimForm'
import { CarrierForm } from './CarrierForm'
import { ReviewQueue } from './ReviewQueue'
import { CarrierDetail } from './CarrierDetail'
import { freshnessLabel } from './freshness'
import { SOURCE_LABELS } from './types'

const uniq = (xs: string[][]) => [...new Set(xs.flat())].sort((a, b) => a.localeCompare(b, 'vi'))

export default function CarriersPage() {
  const session = useSession()
  if (!supabase) return <Notice kind="warn">Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Notice>
  if (session === undefined) return <p className="text-slate-600">Đang tải…</p>
  return <List loggedIn={!!session} userId={session?.user.id} />
}

function List({ loggedIn, userId }: { loggedIn: boolean; userId?: string }) {
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [sel, setSel] = useState('')
  const [view, setView] = useState<'list' | 'add' | 'edit' | 'editOwn' | 'claim' | 'review'>('list')
  const [flash, setFlash] = useState('')
  const admin = useLoad(() => (loggedIn ? isSystemAdmin() : Promise.resolve(false)), [loggedIn])
  const all = useLoad(() => listCarriers(loggedIn), [loggedIn])

  const data = all.data
  const regions = useMemo(() => uniq((data ?? []).map((c) => c.regions)), [data])
  const vehicles = useMemo(() => uniq((data ?? []).map((c) => c.vehicle_types)), [data])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (data ?? []).filter(
      (c) =>
        (!n || c.name.toLowerCase().includes(n)) &&
        (!region || c.regions.includes(region)) &&
        (!vehicle || c.vehicle_types.includes(vehicle)),
    )
  }, [data, q, region, vehicle])

  const current = data?.find((c) => c.id === sel)
  const done = (msg: string) => {
    setFlash(msg)
    setView('list')
    setSel('')
    all.reload()
  }
  if (view === 'add') return <CarrierForm onDone={done} onCancel={() => setView('list')} />
  if (view === 'edit' && current) return <CarrierForm carrier={current} onDone={done} onCancel={() => setView('list')} />
  if (view === 'editOwn' && current) return <CarrierForm carrier={current} direct onDone={done} onCancel={() => setView('list')} />
  if (view === 'claim' && current) return <ClaimForm carrier={current} onDone={done} onCancel={() => setView('list')} />
  if (view === 'review' && admin.data) return <ReviewQueue carriers={data ?? []} onChanged={all.reload} onBack={() => setView('list')} />
  if (current)
    return <CarrierDetail c={current} loggedIn={loggedIn} userId={userId} onBack={() => setSel('')} onSuggest={() => setView('edit')} onEditOwn={() => setView('editOwn')} onClaim={() => setView('claim')} onVerified={all.reload} />

  return (
    <div className="space-y-4">
      {flash && <Notice>{flash}</Notice>}
      {loggedIn && (
        <div className="flex flex-wrap gap-2">
          <Button kind="primary" onClick={() => { setFlash(''); setView('add') }}>+ Thêm nhà vận tải</Button>
          {admin.data && <Button onClick={() => { setFlash(''); setView('review') }}>Duyệt đề xuất / claim</Button>}
        </div>
      )}
      <Card className="grid gap-3 md:grid-cols-3">
        <Field label="Tìm theo tên">
          <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên nhà vận tải" />
        </Field>
        <Field label="Khu vực">
          <select className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Tất cả</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Loại xe">
          <select className={inputClass} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="">Tất cả</option>
            {vehicles.map((v) => <option key={v}>{v}</option>)}
          </select>
        </Field>
      </Card>

      {all.loading && <p className="text-slate-600">Đang tải…</p>}
      {all.error && <Notice kind="error">Không tải được danh bạ. Thử lại sau.</Notice>}
      {data && shown.length === 0 && <p className="text-slate-600">Không có nhà vận tải phù hợp.</p>}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => setSel(c.id)}
              className="block min-h-11 w-full space-y-2 rounded-xl bg-white p-4 text-left shadow-sm hover:bg-slate-50"
            >
              <span className="block text-lg font-semibold">{c.name}</span>
              <span className="block text-sm text-slate-600">
                {c.regions.join(', ') || 'Chưa rõ khu vực'} · {c.vehicle_types.join(', ') || 'Chưa rõ loại xe'}
              </span>
              <span className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{SOURCE_LABELS[c.source]}</span>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">{freshnessLabel(c.last_verified_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
