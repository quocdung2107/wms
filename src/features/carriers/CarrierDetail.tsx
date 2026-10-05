import { useState } from 'react'
import { Button, Card, Notice } from '../../shared/ui/ui'
import { carrierErr, verifyCarrier } from './api'
import { freshnessLabel } from './freshness'
import { SOURCE_LABELS, type Carrier } from './types'

const digits = (s: string) => s.replace(/[^\d+]/g, '')
const zaloHref = (s: string) => `https://zalo.me/${digits(s).replace(/^\+?84/, '0').replace(/^\+/, '')}`

export function CarrierDetail({ c, loggedIn, userId, onBack, onSuggest, onEditOwn, onClaim, onVerified }: { c: Carrier; loggedIn: boolean; userId?: string; onBack: () => void; onSuggest: () => void; onEditOwn: () => void; onClaim: () => void; onVerified: () => void }) {
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function verify() {
    setBusy(true)
    try {
      const ok = await verifyCarrier(c.id)
      setMsg({ kind: 'info', text: ok ? 'Đã ghi nhận: thông tin còn đúng.' : 'Hôm nay bạn đã xác nhận rồi.' })
      if (ok) onVerified()
    } catch (e) {
      setMsg({ kind: 'error', text: carrierErr(e) })
    }
    setBusy(false)
  }
  const isOwner = !!userId && c.owner_id === userId
  const canClaim = loggedIn && c.source === 'community' && !c.owner_id
  const phone = c.phone?.trim()
  const zalo = c.zalo?.trim()
  const email = c.email?.trim()
  const btn = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-base font-medium'
  return (
    <div className="space-y-4">
      <Button onClick={onBack}>← Danh sách</Button>
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">{c.name}</h2>
        <p className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{SOURCE_LABELS[c.source]}</span>
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">{freshnessLabel(c.last_verified_at)}</span>
        </p>
        {c.description && <p className="whitespace-pre-line text-base">{c.description}</p>}
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-600">Khu vực</dt>
            <dd>{c.regions.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-600">Loại xe</dt>
            <dd>{c.vehicle_types.join(', ') || '—'}</dd>
          </div>
        </dl>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-semibold">Liên hệ</h3>
        {!loggedIn ? (
          <Notice>Đăng nhập (tab Tôi) để xem số điện thoại và Zalo.</Notice>
        ) : !phone && !zalo && !email ? (
          <p className="text-slate-600">Chưa có thông tin liên hệ.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {phone && <a className={`${btn} bg-teal-700 text-white`} href={`tel:${digits(phone)}`}>📞 Gọi {phone}</a>}
            {zalo && <a className={`${btn} border border-slate-300 bg-white`} href={zaloHref(zalo)} target="_blank" rel="noreferrer">Zalo {zalo}</a>}
            {email && <a className={`${btn} border border-slate-300 bg-white`} href={`mailto:${email}`}>✉️ {email}</a>}
          </div>
        )}
      </Card>
      {loggedIn && (
        <Card className="space-y-3">
          <h3 className="font-semibold">Đóng góp</h3>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" disabled={busy} onClick={() => void verify()}>Xác nhận thông tin còn đúng</Button>
            {isOwner ? (
              <Button kind="primary" onClick={onEditOwn}>Sửa thông tin (chủ)</Button>
            ) : (
              <Button onClick={onSuggest}>Đề xuất sửa</Button>
            )}
            {canClaim && <Button onClick={onClaim}>Tôi là chủ nhà vận tải này</Button>}
          </div>
        </Card>
      )}
    </div>
  )
}
