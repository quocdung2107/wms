import { useState } from 'react'
import { estimateStock, nowLocal, savePick } from '../../shared/inventory/history.ts'
import { fmtQty } from '../../shared/inventory/sheet.ts'
import { Button, Field, inputClass, Notice } from '../../shared/ui/ui.tsx'

/** 'YYYY-MM-DD HH:MM:SS' <-> giá trị của input datetime-local. */
export const toInputDt = (s: string) => s.slice(0, 16).replace(' ', 'T')
export const fromInputDt = (v: string) => (v ? `${v.replace('T', ' ')}${v.length === 16 ? ':00' : ''}` : nowLocal())

export interface LocTarget {
  sku: string
  description: string
  source: string
  location: string
  batch_no: string
  uom: string
  qtySystem: number | null
  picked: number
}

export default function PickForm({ target, onClose, onSaved }: { target: LocTarget; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [at, setAt] = useState(toInputDt(nowLocal()))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Number(qty.replace(',', '.'))
  const valid = qty.trim() !== '' && Number.isFinite(n) && n > 0
  const est = estimateStock(target.qtySystem, target.picked)
  const over = valid && n > est

  async function save() {
    if (!valid) return setErr('Số lượng phải lớn hơn 0')
    setBusy(true)
    try {
      await savePick({
        sku: target.sku, description: target.description, source: target.source, location: target.location,
        batch_no: target.batch_no, uom: target.uom, qty: n, order_no: orderNo.trim() || null,
        picked_at: fromInputDt(at), note: note.trim(),
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Lấy hàng">
      <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-b-2xl bg-white p-4 md:max-h-[90dvh] md:rounded-2xl">
        <h2 className="text-xl font-bold">Lấy hàng · {target.sku}</h2>
        <p className="text-slate-700">
          {target.location || '—'}{target.batch_no ? ` · ${target.batch_no}` : ''} · tồn ước tính <b>{fmtQty(est)}</b> {target.uom}
        </p>
        <Field label="Số lượng">
          <input className={inputClass} inputMode="decimal" value={qty} autoFocus onChange={(e) => { setQty(e.target.value); setErr('') }} />
        </Field>
        {over && <Notice kind="warn">Số lượng lớn hơn tồn ước tính ({fmtQty(est)}). Vẫn lưu được.</Notice>}
        <Field label="Số đơn (có thể để trống)">
          <input className={inputClass} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
        </Field>
        <Field label="Ngày giờ">
          <input className={inputClass} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex gap-2">
          <Button kind="primary" className="flex-1" disabled={busy} onClick={save}>Lưu</Button>
          <Button className="flex-1" onClick={onClose}>Huỷ</Button>
        </div>
      </div>
    </div>
  )
}
