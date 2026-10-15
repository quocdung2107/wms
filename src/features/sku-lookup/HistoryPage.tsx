import { useState } from 'react'
import {
  buildCountExport, buildPickExport, deleteCount, deletePick, getCountLines, getLinesFor, getSkuStockInfo, listCounts, skuKey, listPicks, periodLabel, updatePick,
  type CountLine, type Pick,
} from '../../shared/inventory/history.ts'
import { attachPick, detachPick, listPickOrders } from '../pick-orders/api.ts'
import { getRowsBySku, type SkuRow } from '../../shared/inventory/repo.ts'
import { fmtQty } from '../../shared/inventory/sheet.ts'
import { exportRows } from '../../shared/inventory/exportFile.ts'
import { Button, Card, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'
import { confirmDialog } from '../../shared/ui/Dialog'

type Tab = 'count' | 'pick'

export default function HistoryPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('count')
  const [sku, setSku] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [err, setErr] = useState('')
  const [allPeriods, setAllPeriods] = useState(false)
  const filter = { sku, from, to, allPeriods }
  const key = [sku, from, to, allPeriods]
  const counts = useLoad(() => listCounts(filter), key)
  const picks = useLoad(() => listPicks(filter), key)
  const orders = useLoad(() => listPickOrders(), [])
  const [attach, setAttach] = useState<number | null>(null)
  const [relot, setRelot] = useState<{ pick: Pick; lots: SkuRow[] } | null>(null)

  async function openRelot(p: Pick) {
    try { setRelot({ pick: p, lots: (await getRowsBySku(p.sku)).filter((r) => r.lot_id != null) }) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  async function doRelot(r: SkuRow) {
    if (!relot) return
    const p = relot.pick
    try {
      await updatePick(p.id, { qty: p.qty, location: r.location ?? '', batch_no: r.batch_no ?? '', note: p.note, picked_at: p.picked_at, lot_id: r.lot_id })
      setErr(''); setRelot(null); picks.reload()
    } catch (e) {
      setRelot(null); setErr(e instanceof Error ? e.message : String(e))
    }
  }
  const pickSkus = [...new Set((picks.data ?? []).map((p) => p.sku))].sort()
  const info = useLoad(() => getSkuStockInfo(pickSkus), [pickSkus.join('|'), picks.data?.length ?? 0])

  const orderCode = new Map((orders.data ?? []).map((o) => [o.id, o.code]))

  async function doAttach(orderId: number) {
    if (attach === null) return
    try {
      await attachPick(attach, orderId)
      setErr(''); setAttach(null); picks.reload()
    } catch (e) {
      setAttach(null)
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function detach(id: number) {
    if (!(await confirmDialog('Gỡ lần lấy này khỏi PK? Bản ghi vẫn giữ ở Lịch sử, Đã lấy của PK sẽ giảm.'))) return
    try { await detachPick(id); setErr(''); picks.reload() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  async function toggle(id: number) {
    if (open === id) return setOpen(null)
    setLines(await getCountLines(id).catch(() => []))
    setOpen(id)
  }

  async function remove(kind: Tab, id: number) {
    if (!(await confirmDialog('Xoá bản ghi này? Không hoàn tác được.', { danger: true }))) return
    try {
      if (kind === 'count') { await deleteCount(id); counts.reload() } else { await deletePick(id); picks.reload() }
      if (open === id) setOpen(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function doExport(kind: 'xlsx' | 'csv') {
    try {
      if (tab === 'count') {
        const list = counts.data ?? []
        await exportRows(buildCountExport(list, await getLinesFor(list.map((c) => c.id))), 'lich-su-kiem-ton', kind)
      } else {
        await exportRows(buildPickExport(picks.data ?? [], await getSkuStockInfo((picks.data ?? []).map((p) => p.sku))), 'lich-su-picking', kind)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <Button kind={tab === t ? 'primary' : 'secondary'} className="flex-1" onClick={() => setTab(t)}>{label}</Button>
  )
  const cur = tab === 'count' ? counts : picks
  const empty = (cur.data?.length ?? 0) === 0

  return (
    <div className="space-y-3">
      <Button onClick={onBack}>← Tra SKU</Button>
      <h2 className="text-xl font-bold">Lịch sử</h2>
      <div className="flex gap-2">{tabBtn('count', 'Kiểm tồn')}{tabBtn('pick', 'Lấy hàng')}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={inputClass} value={sku} placeholder="Lọc theo SKU" aria-label="Lọc SKU" onChange={(e) => setSku(e.target.value)} />
        <input className={inputClass} type="date" value={from} aria-label="Từ ngày" onChange={(e) => setFrom(e.target.value)} />
        <input className={inputClass} type="date" value={to} aria-label="Đến ngày" onChange={(e) => setTo(e.target.value)} />
      </div>
      {tab === 'pick' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allPeriods} onChange={(e) => setAllPeriods(e.target.checked)} /> Hiện cả các kỳ cũ (đã đóng)
        </label>
      )}
      <div className="flex gap-2">
        <Button disabled={empty} onClick={() => doExport('xlsx')}>Xuất Excel</Button>
        <Button disabled={empty} onClick={() => doExport('csv')}>Xuất CSV</Button>
      </div>
      {(err || cur.error) && <Notice kind="error">{err || cur.error}</Notice>}
      {tab === 'pick' && !empty && <p className="text-sm text-slate-500">Tổng hệ thống, Tồn ước tính, Hold là tồn hiện tại của SKU, không phải tại lúc lấy.</p>}
      {!cur.loading && empty && <p className="text-slate-600">Chưa có bản ghi nào.</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tab === 'count' && (counts.data ?? []).map((c) => (
          <Card key={c.id} className="space-y-1">
            <p className="text-sm text-slate-500">{c.counted_at}</p>
            <p className="text-lg font-bold">{c.sku} <span className="text-base font-normal">· {c.location || '—'}{c.batch_no ? ` · ${c.batch_no}` : ''}</span></p>
            <p className="text-sm text-slate-600">{c.description}</p>
            <p>Hệ thống <b>{fmtQty(c.qty_system)}</b> · Đếm <b>{fmtQty(c.qty_counted)}</b> {c.uom} · Lệch{' '}
              <b className={Math.abs(c.diff) < 1e-9 ? 'text-green-700' : 'text-red-700'}>{fmtQty(c.diff)}</b></p>
            {c.note && <p className="text-sm">Ghi chú: {c.note}</p>}
            {open === c.id && (
              <ul className="rounded bg-slate-50 p-2 text-sm">
                {lines.map((l) => <li key={l.seq}>{l.expr} = {l.value}</li>)}
                {lines.length === 0 && <li>Không có dòng phép tính.</li>}
              </ul>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => toggle(c.id)}>{open === c.id ? 'Ẩn phép tính' : 'Xem phép tính'}</Button>
              <Button kind="danger" onClick={() => remove('count', c.id)}>Xoá</Button>
            </div>
          </Card>
        ))}
        {tab === 'pick' && (picks.data ?? []).map((p) => {
          const i = info.data?.get(skuKey(p.sku))
          return (
          <Card key={p.id} className="space-y-1">
            <p className="text-sm text-slate-500">{p.picked_at}</p>
            <p className="text-lg font-bold">{p.sku} <span className="text-base font-normal">· {p.location || '—'}{p.batch_no ? ` · ${p.batch_no}` : ''}</span></p>
            <p className="text-sm text-slate-600">{p.description}</p>
            <p>Lấy <b>{fmtQty(p.qty)}</b> {p.uom}{p.order_no ? ` · Đơn ${p.order_no}` : ''}</p>
            <p className="text-sm text-slate-600">
              Ngày SX {p.manuf_date || '—'} · Lô # {p.lot_id ?? '—'}{p.period != null ? ` · ${periodLabel(p.period, p.closed)}` : ''}
              {p.needs_review && <b className="text-amber-700"> · cần xác nhận</b>}
            </p>
            {i && (
              <p className="text-sm text-slate-600">Tổng hệ thống <b>{fmtQty(i.total)}</b> · Tồn ước tính{' '}
                <b className={i.estimate < 0 ? 'text-red-700' : ''}>{fmtQty(i.estimate)}</b> · Hold <b>{fmtQty(i.hold)}</b> {p.uom} (tồn hiện tại)</p>
            )}
            {p.note && <p className="text-sm">Ghi chú: {p.note}</p>}
            {p.pick_order_id != null && (
              <p className="text-sm">PK: <b>{orderCode.get(p.pick_order_id) ?? `#${p.pick_order_id}`}</b></p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {p.pick_order_id == null
                ? <Button className="flex-1" onClick={() => setAttach(p.id)}>Gắn vào PK</Button>
                : <Button className="flex-1" onClick={() => detach(p.id)}>Gỡ khỏi PK</Button>}
              {!p.closed && <Button className="flex-1" onClick={() => openRelot(p)}>{p.needs_review ? 'Xác nhận lô' : 'Đổi lô'}</Button>}
              <Button kind="danger" onClick={() => remove('pick', p.id)}>Xoá</Button>
            </div>
          </Card>
          )
        })}
      </div>
      {relot && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Chọn lô">
          <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto rounded-b-2xl bg-white p-4 md:rounded-2xl">
            <h2 className="text-xl font-bold">Chọn lô cho {relot.pick.sku}</h2>
            {relot.lots.length === 0 && <p className="text-slate-600">SKU này không còn lô nào trong tồn hiện tại.</p>}
            <ul className="divide-y rounded-lg border border-slate-200">
              {relot.lots.map((r) => (
                <li key={r.lot_id}>
                  <button type="button" className="block min-h-11 w-full px-3 py-2 text-left" onClick={() => doRelot(r)}>
                    <b>{r.location || '—'}</b> · {r.batch_no || '—'} · SX {r.manuf_date || '—'} · Lô # {r.lot_id}
                    {r.lot_id === relot.pick.lot_id ? ' (hiện tại)' : ''}
                  </button>
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={() => setRelot(null)}>Huỷ</Button>
          </div>
        </div>
      )}
      {attach !== null && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Chọn PK">
          <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto rounded-b-2xl bg-white p-4 md:rounded-2xl">
            <h2 className="text-xl font-bold">Gắn vào PK</h2>
            {(orders.data?.length ?? 0) === 0 && <p className="text-slate-600">Chưa có lệnh lấy hàng nào.</p>}
            <ul className="divide-y rounded-lg border border-slate-200">
              {(orders.data ?? []).map((o) => (
                <li key={o.id}>
                  <button type="button" className="block min-h-11 w-full px-3 py-2 text-left" onClick={() => doAttach(o.id)}>
                    <b>{o.code}</b>{o.name ? <span className="text-sm text-slate-600"> · {o.name}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={() => setAttach(null)}>Huỷ</Button>
          </div>
        </div>
      )}
    </div>
  )
}
