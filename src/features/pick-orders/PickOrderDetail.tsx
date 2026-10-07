import { useEffect, useMemo, useState } from 'react'
import PickForm, { fromInputDt, toInputDt, type LocTarget } from '../sku-lookup/PickForm.tsx'
import { deletePick, getPickedBySku, locKey, updatePick, type Pick } from '../../shared/inventory/history.ts'
import { getRowsBySku, getUomMap, searchSkus, type SkuHit } from '../../shared/inventory/repo.ts'
import { fmtQty } from '../../shared/inventory/sheet.ts'
import { makeUomLabeler } from '../../shared/inventory/uom.ts'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'
import {
  addLines, deleteLine, deletePickOrder, getPickOrder, listLines, listOrderPicks, setLineNeed, setOrderRef,
  type PickOrderLine,
} from './api.ts'
import { lineProgress, parsePickSheet, pickedBySku, type LineError } from './logic.ts'

type EditState = { pick: Pick; qty: string; location: string; batch: string; note: string; at: string }

export default function PickOrderDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const order = useLoad(() => getPickOrder(id), [id])
  const lines = useLoad(() => listLines(id), [id])
  const picks = useLoad(() => listOrderPicks(id), [id])
  const [refText, setRefText] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SkuHit[]>([])
  const [sku, setSku] = useState<SkuHit | null>(null)
  const [need, setNeed] = useState('')
  const [errs, setErrs] = useState<LineError[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [form, setForm] = useState<{ line: PickOrderLine; target: LocTarget; choices: LocTarget[] } | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => searchSkus(term).then((h) => alive && setHits(h), () => {}), 120)
    return () => { alive = false; clearTimeout(t) }
  }, [term])

  const done = useMemo(() => pickedBySku(picks.data ?? []), [picks.data])
  const o = order.data
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e))
  const reloadAll = () => { lines.reload(); picks.reload() }

  async function addBySku() {
    const code = sku?.sku ?? term.trim()
    const n = Number(need.replace(',', '.'))
    if (!code) return setErr('Chọn hoặc gõ SKU')
    if (!Number.isFinite(n) || n <= 0) return setErr('Số cần phải là số lớn hơn 0')
    try {
      const rows = await getRowsBySku(code)
      const uomOf = makeUomLabeler(await getUomMap())
      await addLines(id, [{ sku: code, description: sku?.description ?? '', uom: rows[0] ? uomOf(rows[0].uom_raw) : '', qty_need: n }])
      setTerm(''); setSku(null); setNeed(''); setErr(''); setMsg('')
      lines.reload()
    } catch (e) { fail(e) }
  }

  async function importExcel(file: File) {
    setErrs([]); setMsg(''); setErr('')
    try {
      const { assertFileSize, readWorkbook } = await import('../../shared/excel/reader.ts')
      assertFileSize(file.size)
      const sheets = readWorkbook(await file.arrayBuffer())
      const parsed = sheets.map(parsePickSheet)
      const res = parsed.find((r) => r.missing.length === 0)
      if (!res) {
        const miss = parsed[0]?.missing ?? ['SKU', 'Số lượng']
        return setErr(`Không tìm thấy cột ${miss.join(' và ')} trong file. Cần tiêu đề cột "SKU" và "Số lượng".`)
      }
      await addLines(id, res.lines)
      setErrs(res.errors)
      setMsg(`Đã thêm ${res.lines.length} SKU${res.errors.length ? `, bỏ qua ${res.errors.length} dòng lỗi` : ''}.`)
      lines.reload()
    } catch (e) { fail(e) }
  }

  async function openPick(line: PickOrderLine) {
    try {
      const [rows, map, picked] = await Promise.all([getRowsBySku(line.sku), getUomMap(), getPickedBySku(line.sku)])
      const uomOf = makeUomLabeler(map)
      const choices: LocTarget[] = rows.map((r) => ({
        sku: line.sku, description: line.description || r.description || '', source: r.source, location: r.location ?? '',
        batch_no: r.batch_no ?? '', uom: line.uom || uomOf(r.uom_raw), qtySystem: r.qty_system,
        picked: picked.get(locKey(r.source, r.location, r.batch_no)) ?? 0,
      }))
      const target: LocTarget = { sku: line.sku, description: line.description, source: '', location: '', batch_no: '', uom: line.uom, qtySystem: null, picked: 0 }
      setForm({ line, target, choices })
    } catch (e) { fail(e) }
  }

  async function saveEdit() {
    if (!edit) return
    try {
      await updatePick(edit.pick.id, {
        qty: Number(edit.qty.replace(',', '.')), location: edit.location.trim(), batch_no: edit.batch.trim(),
        note: edit.note.trim(), picked_at: fromInputDt(edit.at),
      })
      setEdit(null)
      reloadAll()
    } catch (e) { fail(e) }
  }

  async function removePick(p: Pick) {
    if (!window.confirm('Xoá lần lấy này? Số đã lấy sẽ giảm theo.')) return
    try { await deletePick(p.id); reloadAll() } catch (e) { fail(e) }
  }

  async function removeOrder() {
    if (!window.confirm('Xoá đơn picking này? Các lần lấy đã ghi vẫn còn ở Lịch sử.')) return
    try { await deletePickOrder(id); onBack() } catch (e) { fail(e) }
  }

  async function saveRef() {
    try { await setOrderRef(id, refText ?? o?.order_ref ?? ''); setRefText(null); order.reload() } catch (e) { fail(e) }
  }

  async function changeNeed(l: PickOrderLine) {
    const v = window.prompt(`Số cần của ${l.sku}`, fmtQty(l.qty_need))
    if (v === null) return
    try { await setLineNeed(l.id, Number(v.replace(',', '.'))); lines.reload() } catch (e) { fail(e) }
  }

  async function removeLine(l: PickOrderLine) {
    if (!window.confirm(`Bỏ dòng ${l.sku} khỏi đơn?`)) return
    try { await deleteLine(l.id); lines.reload() } catch (e) { fail(e) }
  }

  const upd = (patch: Partial<EditState>) => setEdit((e) => (e ? { ...e, ...patch } : e))

  return (
    <div className="space-y-4">
      <Button onClick={onBack}>← Danh sách đơn</Button>
      {o && (
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">{o.code}{o.name ? ` · ${o.name}` : ''}</h2>
          <p className="text-sm text-slate-500">{o.created_at}</p>
          <Field label="Mã đơn hàng DH-xxxx">
            <div className="flex gap-2">
              <input className={inputClass} value={refText ?? o.order_ref ?? ''} placeholder="Chưa gắn" onChange={(e) => setRefText(e.target.value)} />
              <Button disabled={refText === null} onClick={saveRef}>Lưu</Button>
            </div>
          </Field>
        </Card>
      )}
      {(err || order.error || lines.error || picks.error) && <Notice kind="error">{err || order.error || lines.error || picks.error}</Notice>}
      {msg && <Notice kind="info">{msg}</Notice>}
      {errs.length > 0 && (
        <Notice kind="warn">
          <ul className="list-disc pl-5">{errs.slice(0, 20).map((e) => <li key={e.row}>Dòng {e.row}: {e.message}</li>)}</ul>
          {errs.length > 20 && <p>… và {errs.length - 20} dòng khác.</p>}
        </Notice>
      )}

      <Card className="space-y-3">
        <h3 className="text-lg font-bold">Thêm hàng cần lấy</h3>
        <Field label="SKU hoặc tên hàng (tìm trong dữ liệu đã nạp)">
          <input className={inputClass} value={term} autoComplete="off" onChange={(e) => { setTerm(e.target.value); setSku(null) }} />
        </Field>
        {hits.length > 0 && !sku && (
          <ul className="divide-y rounded-lg border border-slate-200">
            {hits.map((h) => (
              <li key={h.sku}>
                <button type="button" className="block min-h-11 w-full px-3 py-2 text-left" onClick={() => { setSku(h); setTerm(h.sku); setHits([]) }}>
                  <b>{h.sku}</b> <span className="text-sm text-slate-600">{h.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Số cần">
          <input className={inputClass} inputMode="decimal" value={need} onChange={(e) => setNeed(e.target.value)} />
        </Field>
        <Button kind="primary" onClick={addBySku}>Thêm dòng</Button>
        <Field label="Hoặc nhập từ Excel (cột SKU + Số lượng)">
          <input className={inputClass} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = '' }} />
        </Field>
      </Card>

      <h3 className="text-lg font-bold">Hàng cần lấy</h3>
      {!lines.loading && (lines.data?.length ?? 0) === 0 && <p className="text-slate-600">Chưa có dòng nào.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(lines.data ?? []).map((l) => {
          const pr = lineProgress(l.qty_need, done.get(l.sku.toUpperCase()) ?? 0)
          return (
            <Card key={l.id} className="space-y-2">
              <p className="text-lg font-bold">{l.sku}</p>
              {l.description && <p className="text-sm text-slate-600">{l.description}</p>}
              <p>Cần <b>{fmtQty(pr.need)}</b> · Đã lấy <b>{fmtQty(pr.picked)}</b> · Còn thiếu{' '}
                <b className={pr.missing > 0 ? 'text-red-700' : 'text-green-700'}>{fmtQty(pr.missing)}</b> {l.uom}</p>
              {pr.extra > 0 && <Notice kind="warn">Lấy dư {fmtQty(pr.extra)} {l.uom}.</Notice>}
              <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pr.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ ${l.sku}`}>
                <div className={`h-full ${pr.extra > 0 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${pr.pct}%` }} />
              </div>
              <div className="flex gap-2">
                <Button kind="primary" className="flex-1" onClick={() => openPick(l)}>Lấy hàng</Button>
                <Button onClick={() => changeNeed(l)}>Sửa SL</Button>
                <Button kind="danger" onClick={() => removeLine(l)}>Bỏ</Button>
              </div>
            </Card>
          )
        })}
      </div>

      <h3 className="text-lg font-bold">Lịch sử lấy của đơn</h3>
      {!picks.loading && (picks.data?.length ?? 0) === 0 && <p className="text-slate-600">Chưa lấy lần nào.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(picks.data ?? []).map((p) => (
          <Card key={p.id} className="space-y-1">
            <p className="text-sm text-slate-500">{p.picked_at}</p>
            <p className="text-lg font-bold">{p.sku} <span className="text-base font-normal">· {p.location || '—'}{p.batch_no ? ` · ${p.batch_no}` : ''}</span></p>
            <p>Lấy <b>{fmtQty(p.qty)}</b> {p.uom}</p>
            {p.note && <p className="text-sm">Ghi chú: {p.note}</p>}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={() => setEdit({ pick: p, qty: String(p.qty), location: p.location, batch: p.batch_no, note: p.note, at: toInputDt(p.picked_at) })}>Sửa</Button>
              <Button kind="danger" onClick={() => removePick(p)}>Xoá</Button>
            </div>
          </Card>
        ))}
      </div>

      <Button kind="danger" onClick={removeOrder}>Xoá đơn picking</Button>

      {form && o && (
        <PickForm
          target={form.target}
          pickOrder={{ id, code: o.code, need: form.line.qty_need, picked: done.get(form.line.sku.toUpperCase()) ?? 0, choices: form.choices }}
          onClose={() => setForm(null)}
          onSaved={reloadAll}
        />
      )}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Sửa lần lấy">
          <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto rounded-b-2xl bg-white p-4 md:rounded-2xl">
            <h2 className="text-xl font-bold">Sửa lần lấy · {edit.pick.sku}</h2>
            <Field label="Số lượng"><input className={inputClass} inputMode="decimal" value={edit.qty} onChange={(e) => upd({ qty: e.target.value })} /></Field>
            <Field label="Vị trí"><input className={inputClass} value={edit.location} onChange={(e) => upd({ location: e.target.value })} /></Field>
            <Field label="Lô / Batch"><input className={inputClass} value={edit.batch} onChange={(e) => upd({ batch: e.target.value })} /></Field>
            <Field label="Ngày giờ"><input className={inputClass} type="datetime-local" value={edit.at} onChange={(e) => upd({ at: e.target.value })} /></Field>
            <Field label="Ghi chú"><input className={inputClass} value={edit.note} onChange={(e) => upd({ note: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button kind="primary" className="flex-1" onClick={saveEdit}>Lưu</Button>
              <Button className="flex-1" onClick={() => setEdit(null)}>Huỷ</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
