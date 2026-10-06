import { useState } from 'react'
import { saveCount, nowLocal } from '../../shared/inventory/history.ts'
import { fmtQty } from '../../shared/inventory/sheet.ts'
import { Button, Field, inputClass, Notice } from '../../shared/ui/ui.tsx'
import { calcDiff, evalExpr, sumLines } from './calc.ts'
import { fromInputDt, toInputDt, type LocTarget } from './PickForm.tsx'

const round4 = (v: number) => Math.round(v * 1e4) / 1e4

export default function CountDrawer({ target, onClose, onSaved }: { target: LocTarget; onClose: () => void; onSaved: () => void }) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<{ expr: string; value: number }[]>([])
  const [err, setErr] = useState('')
  const [at, setAt] = useState(toInputDt(nowLocal()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const total = sumLines(lines.map((l) => l.value))
  const diff = calcDiff(target.qtySystem, total)

  function add() {
    const r = evalExpr(input)
    if (!r.ok) return setErr(r.error)
    setLines((l) => [...l, { expr: input.trim(), value: r.value }])
    setInput('')
    setErr('')
  }

  async function save() {
    if (lines.length === 0) return setErr('Chưa có dòng phép tính nào')
    setBusy(true)
    try {
      await saveCount({
        sku: target.sku, description: target.description, source: target.source, location: target.location,
        batch_no: target.batch_no, uom: target.uom, qty_system: target.qtySystem ?? 0, qty_counted: total, diff,
        counted_at: fromInputDt(at), note: note.trim(), lines,
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Kiểm tồn">
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl">
        <h2 className="text-xl font-bold">Kiểm · {target.sku}</h2>
        <p className="text-slate-700">
          {target.location || '—'}{target.batch_no ? ` · ${target.batch_no}` : ''} · tồn hệ thống <b>{fmtQty(target.qtySystem)}</b> {target.uom}
        </p>
        <div className="flex gap-2">
          <input
            className={`${inputClass} text-lg`}
            value={input}
            autoFocus
            autoComplete="off"
            placeholder="vd 6*12 hoặc 90x7-3"
            aria-label="Phép tính"
            onChange={(e) => { setInput(e.target.value); setErr('') }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); add() } }}
          />
          <Button kind="primary" onClick={add}>=</Button>
        </div>
        {err && <Notice kind="error">{err}</Notice>}
        <ul className="divide-y divide-slate-100">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0 break-words">+ {l.expr} = <b>{round4(l.value)}</b></span>
              <Button kind="danger" className="min-h-9 px-2 py-1" aria-label={`Xoá dòng ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Xoá</Button>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-slate-200 pt-2">
          <p className="text-3xl font-extrabold">Tổng: {round4(total)} <span className="text-base font-normal">{target.uom}</span></p>
          <p className={`text-xl font-bold ${diff === 0 ? 'text-green-700' : 'text-red-700'}`}>Lệch: {round4(diff)}</p>
        </div>
        <Field label="Giờ kiểm">
          <input className={inputClass} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button kind="primary" className="flex-1" disabled={busy || lines.length === 0} onClick={save}>Lưu kiểm</Button>
          <Button className="flex-1" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  )
}
