import { useEffect, useState } from 'react'
import { query } from '../../shared/db/client.ts'
import { initSchema } from '../../shared/inventory/repo.ts'
import { supabase } from '../../shared/supabase/client.ts'
import { Card, Notice, useLoad } from '../../shared/ui/ui.tsx'
import { errText } from '../orders/api.ts'
import { useSession } from '../orders/useSession.ts'

async function localCounts() {
  await initSchema()
  const [a] = await query('SELECT COUNT(*) AS n FROM count_sessions')
  const [b] = await query("SELECT COUNT(*) AS n FROM pick_orders WHERE status = 'open'")
  return { counts: Number(a?.n ?? 0), picks: Number(b?.n ?? 0) }
}

async function attentionCount() {
  if (!supabase) return 0
  const { data, error } = await supabase.from('orders_view').select('id,status,needs_attention').limit(1000)
  if (error) throw error
  return (data ?? []).filter((o) => o.status !== 'COMPLETED' && o.needs_attention).length
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const Tag = href ? 'a' : 'div'
  return (
    <Tag href={href} className="block min-h-20 rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
      <span className="block text-3xl font-bold text-brand-700">{value}</span>
      <span className="block text-base text-slate-700">{label}</span>
    </Tag>
  )
}

export default function OverviewPage() {
  const session = useSession()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])

  const local = useLoad(localCounts, [])
  const signedIn = !!session && online
  const att = useLoad(async () => (signedIn ? attentionCount() : null), [signedIn])

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Phiếu kiểm đã lưu" value={local.loading ? '…' : (local.data?.counts ?? '–')} href="#/kiem-kho" />
        <Stat label="Đơn PK còn dở" value={local.loading ? '…' : (local.data?.picks ?? '–')} href="#/don-picking" />
        {signedIn && !att.error && (
          <Stat label="Đơn cần chú ý" value={att.loading ? '…' : (att.data ?? '–')} />
        )}
      </div>
      {local.error && <Notice kind="warn">Chưa đọc được dữ liệu trên máy: {local.error}</Notice>}
      {signedIn && att.error && <Notice kind="warn">Chưa tải được đơn hàng: {errText(att.error)}</Notice>}
      {!signedIn && (
        <Card>
          <p className="text-base text-slate-700">
            {!online
              ? 'Đang ngoại tuyến: số đơn cần chú ý sẽ hiện khi có mạng và đã đăng nhập. Công cụ kho vẫn dùng bình thường.'
              : session === undefined
                ? 'Đang kiểm tra đăng nhập…'
                : 'Đăng nhập để xem số đơn cần chú ý. Công cụ kho dùng được không cần tài khoản.'}
          </p>
        </Card>
      )}
    </div>
  )
}
