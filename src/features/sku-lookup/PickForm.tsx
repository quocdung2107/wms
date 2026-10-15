import { useState } from 'react'
import { nowLocal, savePick } from '../../shared/inventory/history.ts'
import { fmtDate, fmtQty } from '../../shared/inventory/sheet.ts'
import { checkLotPick, lotRemaining } from './calc.ts'
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
  /** Lô tồn (inventory_rows.lot_id); null = chưa chọn lô. */
  lot_id: number | null
  manuf_date: string
}

/** Lấy hàng theo lệnh lấy hàng: SKU + đơn điền sẵn; người lấy chọn một lô trong `choices` (không gõ tay). */
export interface PickOrderCtx {
  id: number
  code: string
  need: number
  picked: number
  choices: LocTarget[]
}

export default function PickForm({ target, pickOrder, onClose, onSaved }: { target: LocTarget; pickOrder?: PickOrderCtx; onClose: () => void; onSaved: () => void }) {
  const [loc, setLoc] = useState<LocTarget | null>(pickOrder ? null : target)
  const [qty, setQty] = useState('')
  const [orderNo, setOrderNo] = useState(pickOrder?.code ?? '')
  const [at, setAt] = useState(toInputDt(nowLocal()))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Number(qty.replace(',', '.'))
  const valid = qty.trim() !== '' && Number.isFinite(n) && n > 0
  const est = loc ? lotRemaining(loc.qtySystem, loc.picked) : 0
  const over = valid && !!loc && !checkLotPick(loc.qtySystem, loc.picked, n).ok
  const orderOff = pickOrder && valid ? pickOrder.picked + n - pickOrder.need : 0

  function choose(i: string) {
    setErr('')
    setLoc(i === '' ? null : pickOrder!.choices[Number(i)])
  }

  async function save() {
    if (!loc) return setErr('Chọn một lô để lấy')
    if (!valid) return setErr('Số lượng phải lớn hơn 0')
    if (over) return setErr(`Lô này chỉ còn ${fmtQty(est)}, không lấy được ${fmtQty(n)}`)
    setBusy(true)
    try {
      await savePick({
        sku: target.sku, description: target.description, source: loc.source,
        location: loc.location, batch_no: loc.batch_no, lot_id: loc.lot_id, uom: target.uom, qty: n, order_no: orderNo.trim() || null,
        picked_at: fromInputDt(at), note: note.trim(), pick_order_id: pickOrder?.id ?? null,
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
        {pickOrder ? (
          <>
            <p className="text-slate-700">
              Đơn <b>{pickOrder.code}</b> · cần <b>{fmtQty(pickOrder.need)}</b> · đã lấy <b>{fmtQty(pickOrder.picked)}</b> {target.uom}
            </p>
            {pickOrder.choices.length > 0 ? (
              <Field label="Chọn lô để lấy">
                <select className={inputClass} defaultValue="" onChange={(e) => choose(e.target.value)}>
                  <option value="">— Chọn lô —</option>
                  {pickOrder.choices.map((c, i) => (
                    <option key={c.lot_id ?? `i${i}`} value={i}>
                      {c.location || '—'}{c.batch_no ? ` · ${c.batch_no}` : ''}{c.manuf_date ? ` · NSX ${fmtDate(c.manuf_date)}` : ''} · còn {fmtQty(lotRemaining(c.qtySystem, c.picked))}{c.lot_id != null ? ` · Lô #${c.lot_id}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Notice kind="warn">SKU này không có lô nào trong tồn.</Notice>
            )}
          </>
        ) : (
          <p className="text-slate-700">
            {target.location || '—'}{target.batch_no ? ` · ${target.batch_no}` : ''}{target.manuf_date ? ` · NSX ${fmtDate(target.manuf_date)}` : ''}{target.lot_id != null ? ` · Lô #${target.lot_id}` : ''} · còn <b>{fmtQty(est)}</b> {target.uom}
          </p>
        )}
        <Field label="Số lượng">
          <input className={inputClass} inputMode="decimal" value={qty} autoFocus onChange={(e) => { setQty(e.target.value); setErr('') }} />
        </Field>
        {over && <Notice kind="error">Lô này chỉ còn {fmtQty(est)}, không lấy nhiều hơn được.</Notice>}
        {orderOff > 0 && <Notice kind="warn">Lấy dư so với đơn {fmtQty(orderOff)} {target.uom}. Vẫn lưu được.</Notice>}
        {orderOff < 0 && <Notice kind="info">Sau lần này còn thiếu {fmtQty(-orderOff)} {target.uom} so với đơn.</Notice>}
        <Field label="Số đơn (có thể để trống)">
          <input className={inputClass} value={orderNo} readOnly={!!pickOrder} onChange={(e) => setOrderNo(e.target.value)} />
        </Field>
        <Field label="Ngày giờ">
          <input className={inputClass} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex gap-2">
          <Button kind="primary" className="flex-1" disabled={busy || !loc || over} onClick={save}>Lưu</Button>
          <Button className="flex-1" onClick={onClose}>Huỷ</Button>
        </div>
      </div>
    </div>
  )
}
