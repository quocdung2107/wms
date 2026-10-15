import { useState, type ReactNode } from 'react'
import {
  planEdit, planMerge, planMove, planSplit, rowEstimate,
  type EditPlan, type EditRow, type PartInput, type PickedMap, type RowSnap,
} from '../../shared/inventory/edit.ts'
import { getPickedByLot } from '../../shared/inventory/history.ts'
import { applyEditPlan, getRows, listInventoryEdits, type Source } from '../../shared/inventory/repo.ts'
import { Button, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

const KIND_LABEL: Record<string, string> = { edit: 'Sửa', move: 'Di chuyển', split: 'Tách', merge: 'Gộp', receive: 'Nhập hàng' }

type Modal =
  | { type: 'edit' | 'move' | 'split'; row: EditRow }
  | { type: 'merge'; rows: EditRow[] }

type Loaded = { rows: EditRow[]; picked: Map<string, PickedMap> }

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-xl bg-white p-4 shadow-lg sm:rounded-xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        {children}
        <div className="flex justify-end"><Button onClick={onClose}>Đóng</Button></div>
      </div>
    </div>
  )
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

function PlanForm({ run, onDone, children, submitText }: {
  run: () => EditPlan
  onDone: () => void
  children: ReactNode
  submitText: string
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    const plan = run()
    if (!plan.ok) return setError(plan.error)
    setBusy(true)
    try {
      await applyEditPlan(plan)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      {children}
      {error && <Notice kind="error">{error}</Notice>}
      <Button kind="primary" onClick={submit} disabled={busy} className="w-full">{submitText}</Button>
    </div>
  )
}

function Txt({ label, value, set, type }: { label: string; value: string; set: (v: string) => void; type?: string }) {
  return (
    <Field label={label}>
      <input className={inputClass} type={type} value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  )
}

function EditForm({ row, picked, onDone }: { row: EditRow; picked: PickedMap; onDone: () => void }) {
  const [loc, setLoc] = useState(row.location ?? '')
  const [batch, setBatch] = useState(row.batch_no ?? '')
  const [manuf, setManuf] = useState(row.manuf_date ?? '')
  return (
    <PlanForm submitText="Lưu" onDone={onDone} run={() => planEdit(row, { location: loc, batch_no: batch, manuf_date: manuf }, picked)}>
      <p className="text-sm text-slate-600">Tồn ước tính giữ nguyên: {rowEstimate(row, picked)}</p>
      <Txt label="Location" value={loc} set={setLoc} />
      <Txt label="BatchNo" value={batch} set={setBatch} />
      <Txt label="Ngày SX (YYYY-MM-DD hoặc DD/MM/YYYY)" value={manuf} set={setManuf} />
    </PlanForm>
  )
}

function MoveForm({ row, all, picked, onDone }: { row: EditRow; all: EditRow[]; picked: PickedMap; onDone: () => void }) {
  const est = rowEstimate(row, picked)
  const [qty, setQty] = useState(String(est))
  const [to, setTo] = useState('')
  return (
    <PlanForm submitText="Di chuyển" onDone={onDone} run={() => planMove(row, num(qty), to, all, picked)}>
      <p className="text-sm text-slate-600">Từ {row.location || '(trống)'} · tồn ước tính {est}</p>
      <Txt label="Số lượng di chuyển" value={qty} set={setQty} type="number" />
      <Txt label="Location đích" value={to} set={setTo} />
    </PlanForm>
  )
}

function SplitForm({ row, picked, onDone }: { row: EditRow; picked: PickedMap; onDone: () => void }) {
  const est = rowEstimate(row, picked)
  type P = { location: string; batch_no: string; manuf_date: string; qty: string }
  const blank: P = { location: '', batch_no: row.batch_no ?? '', manuf_date: row.manuf_date ?? '', qty: '' }
  const [parts, setParts] = useState<P[]>([{ ...blank, location: row.location ?? '', qty: String(est) }, blank])
  const upd = (i: number, k: keyof P, v: string) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const sum = parts.reduce((s, p) => s + (num(p.qty) || 0), 0)
  return (
    <PlanForm
      submitText="Tách"
      onDone={onDone}
      run={() => planSplit(row, parts.map((p): PartInput => ({ ...p, qty: num(p.qty) })), picked)}
    >
      <p className="text-sm text-slate-600">Tồn ước tính {est}; tổng các phần phải bằng số này (đang {Math.round(sum * 1e6) / 1e6}).</p>
      {parts.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <b>Phần {i + 1}</b>
            {parts.length > 2 && <Button onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}>Bỏ</Button>}
          </div>
          <Txt label="Location" value={p.location} set={(v) => upd(i, 'location', v)} />
          <Txt label="BatchNo" value={p.batch_no} set={(v) => upd(i, 'batch_no', v)} />
          <Txt label="Ngày SX" value={p.manuf_date} set={(v) => upd(i, 'manuf_date', v)} />
          <Txt label="Số lượng" value={p.qty} set={(v) => upd(i, 'qty', v)} type="number" />
        </div>
      ))}
      <Button onClick={() => setParts((ps) => [...ps, { ...blank }])}>Thêm phần</Button>
    </PlanForm>
  )
}

function MergeForm({ rows, picked, onDone }: { rows: EditRow[]; picked: PickedMap; onDone: () => void }) {
  const [loc, setLoc] = useState(rows[0]?.location ?? '')
  const total = rows.reduce((s, r) => s + rowEstimate(r, picked), 0)
  return (
    <PlanForm submitText="Gộp" onDone={onDone} run={() => planMerge(rows, loc, picked)}>
      <p className="text-sm text-slate-600">Gộp {rows.length} dòng ({rows.map((r) => r.location || '(trống)').join(', ')}). Tồn ước tính sau gộp: {Math.round(total * 1e6) / 1e6}.</p>
      <Txt label="Location kết quả" value={loc} set={setLoc} />
    </PlanForm>
  )
}

/** Danh sách dòng của một nguồn + nút Sửa/Di chuyển/Tách/Gộp. */
export function RowsPanel({ source, onChanged }: { source: Source; onChanged: () => void }) {
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [modal, setModal] = useState<Modal | null>(null)
  const [msg, setMsg] = useState('')
  const t = term.trim().toLowerCase()
  const data = useLoad<Loaded>(async () => {
    if (!t) return { rows: [], picked: new Map() }
    const all = (await getRows(source.id))
      .filter((r) => r.sku.toLowerCase().includes(t) || (r.description ?? '').toLowerCase().includes(t))
      .slice(0, 100)
      .map((r): EditRow => ({ ...r, source: source.name }))
    const picked = new Map<string, PickedMap>()
    for (const sku of new Set(all.map((r) => r.sku))) picked.set(sku, await getPickedByLot(sku))
    return { rows: all, picked }
  }, [source.id, t])

  const rows = data.data?.rows ?? []
  const pickedOf = (sku: string): PickedMap => data.data?.picked.get(sku) ?? new Map()
  // Dòng cùng SKU (để Di chuyển tìm dòng đích): lấy từ danh sách đang hiện, đủ vì lọc theo SKU/tên.
  const chosen = rows.filter((r) => selected.includes(r.id))

  function done() {
    setModal(null)
    setSelected([])
    setMsg('Đã lưu và ghi nhật ký.')
    data.reload()
    onChanged()
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <Field label="Tìm SKU hoặc tên hàng trong nguồn này để sửa dòng">
        <input className={inputClass} value={term} onChange={(e) => { setTerm(e.target.value); setSelected([]); setMsg('') }} />
      </Field>
      {msg && <Notice>{msg}</Notice>}
      {data.error && <Notice kind="error">{data.error}</Notice>}
      {t && !data.loading && rows.length === 0 && <p className="text-slate-600">Không có dòng nào khớp.</p>}
      {chosen.length >= 2 && (
        <Button onClick={() => setModal({ type: 'merge', rows: chosen })}>Gộp {chosen.length} dòng đã chọn</Button>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 size-5"
                checked={selected.includes(r.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                aria-label={`Chọn dòng ${r.sku} ${r.location}`}
              />
              <span className="min-w-0 text-sm">
                <b>{r.sku}</b> {r.description}
                <br />
                Location {r.location || '—'} · Batch {r.batch_no || '—'} · SX {r.manuf_date || '—'} · Tồn ước tính{' '}
                <b>{rowEstimate(r, pickedOf(r.sku))}</b>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setModal({ type: 'edit', row: r })}>Sửa</Button>
              <Button onClick={() => setModal({ type: 'move', row: r })}>Di chuyển</Button>
              <Button onClick={() => setModal({ type: 'split', row: r })}>Tách</Button>
            </div>
          </li>
        ))}
      </ul>
      {modal && (
        <Dialog title={`${KIND_LABEL[modal.type]} dòng tồn`} onClose={() => setModal(null)}>
          {modal.type === 'edit' && <EditForm row={modal.row} picked={pickedOf(modal.row.sku)} onDone={done} />}
          {modal.type === 'move' && (
            <MoveForm row={modal.row} all={rows.filter((r) => r.sku === modal.row.sku)} picked={pickedOf(modal.row.sku)} onDone={done} />
          )}
          {modal.type === 'split' && <SplitForm row={modal.row} picked={pickedOf(modal.row.sku)} onDone={done} />}
          {modal.type === 'merge' && <MergeForm rows={modal.rows} picked={pickedOf(modal.rows[0].sku)} onDone={done} />}
        </Dialog>
      )}
    </div>
  )
}

const snapText = (s: unknown) =>
  Array.isArray(s)
    ? (s as RowSnap[]).map((x) => `${x.location || '—'}/${x.batch_no || '—'}/${x.manuf_date || '—'}: ${x.qty}`).join(' | ')
    : ''

/** Nhật ký sửa/di chuyển/tách/gộp. */
export function EditLogPanel() {
  const log = useLoad(() => listInventoryEdits(200), [])
  return (
    <div className="space-y-2">
      {log.error && <Notice kind="error">{log.error}</Notice>}
      {log.data?.length === 0 && <p className="text-slate-600">Chưa có chỉnh sửa nào.</p>}
      <ul className="space-y-2">
        {log.data?.map((e) => (
          <li key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <b>{KIND_LABEL[e.kind] ?? e.kind}</b> · {e.sku} · {e.source} · {e.at}
            <br />
            <span className="text-slate-600">Trước: {snapText(e.before)}</span>
            <br />
            <span className="text-slate-600">Sau: {snapText(e.after)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
