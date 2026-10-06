import { useState } from 'react'
import {
  buildCountExport, buildPickExport, deleteCount, deletePick, getCountLines, getLinesFor, listCounts, listPicks,
  type CountLine,
} from '../../shared/inventory/history.ts'
import { fmtQty } from '../../shared/inventory/sheet.ts'
import { Button, Card, downloadBlob, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

type Tab = 'count' | 'pick'

async function exportRows(aoa: (string | number | boolean | Date | null | undefined)[][], base: string, kind: 'xlsx' | 'csv') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const stamp = new Date().toISOString().slice(0, 10)
  if (kind === 'csv') {
    downloadBlob(`${base}-${stamp}.csv`, '﻿' + XLSX.utils.sheet_to_csv(ws), 'text/csv;charset=utf-8')
  } else {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    downloadBlob(`${base}-${stamp}.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }
}

export default function HistoryPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('count')
  const [sku, setSku] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [err, setErr] = useState('')
  const filter = { sku, from, to }
  const key = [sku, from, to]
  const counts = useLoad(() => listCounts(filter), key)
  const picks = useLoad(() => listPicks(filter), key)

  async function toggle(id: number) {
    if (open === id) return setOpen(null)
    setLines(await getCountLines(id).catch(() => []))
    setOpen(id)
  }

  async function remove(kind: Tab, id: number) {
    if (!window.confirm('Xoá bản ghi này? Không hoàn tác được.')) return
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
        await exportRows(buildPickExport(picks.data ?? []), 'lich-su-picking', kind)
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
      <div className="flex gap-2">{tabBtn('count', 'Kiểm tồn')}{tabBtn('pick', 'Picking')}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={inputClass} value={sku} placeholder="Lọc theo SKU" aria-label="Lọc SKU" onChange={(e) => setSku(e.target.value)} />
        <input className={inputClass} type="date" value={from} aria-label="Từ ngày" onChange={(e) => setFrom(e.target.value)} />
        <input className={inputClass} type="date" value={to} aria-label="Đến ngày" onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button disabled={empty} onClick={() => doExport('xlsx')}>Xuất Excel</Button>
        <Button disabled={empty} onClick={() => doExport('csv')}>Xuất CSV</Button>
      </div>
      {(err || cur.error) && <Notice kind="error">{err || cur.error}</Notice>}
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
        {tab === 'pick' && (picks.data ?? []).map((p) => (
          <Card key={p.id} className="space-y-1">
            <p className="text-sm text-slate-500">{p.picked_at}</p>
            <p className="text-lg font-bold">{p.sku} <span className="text-base font-normal">· {p.location || '—'}{p.batch_no ? ` · ${p.batch_no}` : ''}</span></p>
            <p className="text-sm text-slate-600">{p.description}</p>
            <p>Lấy <b>{fmtQty(p.qty)}</b> {p.uom}{p.order_no ? ` · Đơn ${p.order_no}` : ''}</p>
            {p.note && <p className="text-sm">Ghi chú: {p.note}</p>}
            <Button kind="danger" onClick={() => remove('pick', p.id)}>Xoá</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
