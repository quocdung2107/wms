import { useEffect, useState } from 'react'
import type { PickedMap } from '../../shared/inventory/edit.ts'
import { getPickedByLot, nowLocal, skuKey } from '../../shared/inventory/history.ts'
import { planReceive, type ReceiveLine, type ReceivePlan } from '../../shared/inventory/receive.ts'
import { applyReceivePlan, getRows, listSources, searchSkus, type SkuHit } from '../../shared/inventory/repo.ts'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

interface Line { sku: string; qty: string; location: string; batch_no: string; manuf_date: string; receive_date: string; expiry_date: string; description: string; uom_raw: string }
const blank = (): Line => ({ sku: '', qty: '', location: '', batch_no: '', manuf_date: '', receive_date: '', expiry_date: '', description: '', uom_raw: '' })

function SkuInput({ value, onChange, onPick }: { value: string; onChange: (v: string) => void; onPick: (h: SkuHit) => void }) {
  const [hits, setHits] = useState<SkuHit[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => searchSkus(value).then((h) => alive && setHits(h), () => {}), 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [value])
  return (
    <div className="relative">
      <input className={inputClass} value={value} placeholder="SKU" onChange={(e) => { onChange(e.target.value); setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && value.trim() && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow">
          {hits.map((h) => (
            <li key={h.sku}>
              <button type="button" className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onMouseDown={(e) => { e.preventDefault(); onPick(h); setOpen(false) }}>
                <b>{h.sku}</b> <span className="text-slate-600">{h.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ReceivePage() {
  const sources = useLoad(listSources, [])
  const [sourceId, setSourceId] = useState(0)
  const [lines, setLines] = useState<Line[]>([blank()])
  const [plan, setPlan] = useState<ReceivePlan | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const source = sources.data?.find((s) => s.id === sourceId)
  const touch = () => { setPlan(null); setError(''); setDone('') }
  const setLine = (i: number, p: Partial<Line>) => { touch(); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l))) }

  const toInput = (l: Line): ReceiveLine => ({
    sku: l.sku, qty: l.qty.trim() === '' ? NaN : Number(l.qty.replace(',', '.')), location: l.location, batch_no: l.batch_no,
    manuf_date: l.manuf_date, receive_date: l.receive_date, expiry_date: l.expiry_date, description: l.description, uom_raw: l.uom_raw,
  })

  async function build(): Promise<ReceivePlan | null> {
    if (!source) { setError('Chọn nguồn nhận hàng'); return null }
    const rows = (await getRows(source.id)).map((r) => ({ ...r, source: source.name }))
    const picked = new Map<string, PickedMap>()
    const skus = new Set([...rows.map((r) => r.sku), ...lines.map((l) => l.sku.trim())].filter(Boolean))
    for (const s of skus) {
      const k = skuKey(s)
      const m = await getPickedByLot(s)
      const cur = picked.get(k)
      if (cur) for (const [a, b] of m) cur.set(a, (cur.get(a) ?? 0) + b)
      else picked.set(k, new Map(m))
    }
    return planReceive({ id: source.id, name: source.name }, lines.map(toInput), rows, picked, nowLocal().slice(0, 10))
  }

  async function preview() {
    setBusy(true); setError(''); setDone('')
    try {
      const p = await build()
      if (!p) return
      if (!p.ok) { setPlan(null); setError(p.error) } else setPlan(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function save() {
    if (!plan || !plan.ok || busy) return
    setBusy(true)
    const n = lines.length
    try {
      await applyReceivePlan(plan)
      setLines([blank()]); setPlan(null); setError(''); setDone(`Đã nhập ${n} dòng`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h2 className="text-xl font-semibold">Nhập hàng</h2>
      <Notice kind="warn">Nạp lại file MISA cùng nguồn sẽ ghi đè các dòng nhập tay</Notice>
      {sources.error && <Notice kind="error">{sources.error}</Notice>}
      {sources.data && sources.data.length === 0 && <Notice>Chưa có nguồn nào. Nạp file ở trang Nạp dữ liệu trước.</Notice>}
      <Card className="space-y-3">
        <Field label="Nguồn nhận hàng (bắt buộc)">
          <select className={inputClass} value={sourceId} onChange={(e) => { touch(); setSourceId(Number(e.target.value)) }}>
            <option value={0}>— Chọn nguồn —</option>
            {sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Card>
      {lines.map((l, i) => (
        <Card key={i} className="space-y-3">
          <div className="flex items-center justify-between">
            <b>Dòng {i + 1}</b>
            <Button kind="danger" disabled={lines.length === 1} onClick={() => { touch(); setLines((ls) => ls.filter((_, j) => j !== i)) }}>Xoá dòng</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="SKU"><SkuInput value={l.sku} onChange={(v) => setLine(i, { sku: v })} onPick={(h) => setLine(i, { sku: h.sku, description: h.description })} /></Field>
            <Field label="Số lượng"><input className={inputClass} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></Field>
            <Field label="Location"><input className={inputClass} value={l.location} onChange={(e) => setLine(i, { location: e.target.value })} /></Field>
            <Field label="BatchNo"><input className={inputClass} value={l.batch_no} onChange={(e) => setLine(i, { batch_no: e.target.value })} /></Field>
            <Field label="Ngày SX"><input className={inputClass} placeholder="YYYY-MM-DD" value={l.manuf_date} onChange={(e) => setLine(i, { manuf_date: e.target.value })} /></Field>
            <Field label="Ngày nhập (bỏ trống = hôm nay)"><input className={inputClass} placeholder="YYYY-MM-DD" value={l.receive_date} onChange={(e) => setLine(i, { receive_date: e.target.value })} /></Field>
            <Field label="Hạn dùng"><input className={inputClass} placeholder="YYYY-MM-DD" value={l.expiry_date} onChange={(e) => setLine(i, { expiry_date: e.target.value })} /></Field>
            <Field label="Mô tả (bắt buộc với SKU mới)"><input className={inputClass} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
            <Field label="ĐVT (bắt buộc với SKU mới)"><input className={inputClass} value={l.uom_raw} onChange={(e) => setLine(i, { uom_raw: e.target.value })} /></Field>
          </div>
        </Card>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => { touch(); setLines((ls) => [...ls, blank()]) }}>Thêm dòng</Button>
        <Button onClick={preview} disabled={busy}>Xem trước</Button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {done && <Notice>{done}</Notice>}
      {plan?.ok && (
        <Card className="space-y-3">
          <h3 className="font-semibold">Xem trước</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.ops.map((o, i) => (
              <li key={i}>
                {o.op === 'insert'
                  ? `Thêm dòng mới: ${o.row.sku} · ${o.row.location || '(không vị trí)'} · lô ${o.row.batch_no || '-'} · SL hệ thống ${o.row.qty_system}`
                  : o.op === 'update'
                    ? `Cộng vào dòng #${o.id}: SL hệ thống mới ${o.set.qty_system}`
                    : `${o.op}`}
              </li>
            ))}
          </ul>
          <Button kind="primary" className="w-full sm:w-auto" onClick={save} disabled={busy}>Lưu</Button>
        </Card>
      )}
    </div>
  )
}
