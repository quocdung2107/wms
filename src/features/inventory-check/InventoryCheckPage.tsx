import { useMemo, useState } from 'react'
import { NoDataNotice, useSourceRows } from '../../shared/inventory/hooks.tsx'
import {
  buildSheet, countLines, DEFAULT_OPTIONS, distinct, FLAG_TEXT, fmtDate, fmtQty, rackGroup,
  type SheetGroup, type SheetLine, type SheetOptions,
} from '../../shared/inventory/sheet.ts'
import { Button, Card, downloadBlob, Field, inputClass, Notice, printPage, usePersisted } from '../../shared/ui/ui.tsx'

type Prefs = {
  merge: boolean
  blind: boolean
  cols: { batch: boolean; manuf: boolean; receive: boolean; expiry: boolean; condition: boolean; note: boolean }
}
const DEFAULT_PREFS: Prefs = {
  merge: true,
  blind: false,
  cols: { batch: true, manuf: true, receive: true, expiry: true, condition: true, note: true },
}
const COL_LABELS: Record<keyof Prefs['cols'], string> = {
  batch: 'Batch No',
  manuf: 'Ngày SX',
  receive: 'Ngày nhập',
  expiry: 'Hạn dùng',
  condition: 'Tình trạng',
  note: 'Ghi chú',
}

const today = () => new Date().toISOString().slice(0, 10)

function Flag({ line }: { line: SheetLine }) {
  if (!line.flag) return null
  return <span className="ml-1 rounded bg-amber-200 px-1 text-xs font-bold text-amber-900 print:border print:border-black print:bg-white print:text-black">{FLAG_TEXT[line.flag]}</span>
}

function SheetTable({ group, title, prefs }: { group: SheetGroup; title: string; prefs: Prefs }) {
  const { cols, blind } = prefs
  const th = 'border border-slate-400 px-1.5 py-1 text-left font-semibold'
  const td = 'border border-slate-400 px-1.5 py-1 align-top'
  const small = 'text-[8pt] leading-tight'
  const span = 7 - (blind ? 1 : 0) + Object.values(cols).filter(Boolean).length
  return (
    <section className="hidden overflow-x-auto md:block print:block">
      <table className="w-full border-collapse text-sm print:text-[9pt]">
        <thead>
          <tr>
            <th colSpan={span} className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-left text-base print:bg-white">
              {title} · Dãy <b>{group.name}</b> · {group.lines.length} dòng
            </th>
          </tr>
          <tr className="bg-slate-50 print:bg-white">
            <th className={th}>Vị trí</th>
            <th className={th}>SKU</th>
            <th className={th}>Tên hàng</th>
            <th className={th}>ĐVT</th>
            {!blind && <th className={`${th} text-right`}>SL hệ thống</th>}
            <th className={`${th} w-24`}>SL thực đếm</th>
            <th className={`${th} w-24`}>Chênh lệch</th>
            {cols.batch && <th className={`${th} ${small}`}>Batch No</th>}
            {cols.manuf && <th className={`${th} ${small}`}>Ngày SX</th>}
            {cols.receive && <th className={`${th} ${small}`}>Ngày nhập</th>}
            {cols.expiry && <th className={`${th} ${small}`}>Hạn dùng</th>}
            {cols.condition && <th className={`${th} ${small}`}>Tình trạng</th>}
            {cols.note && <th className={`${th} w-32`}>Ghi chú</th>}
          </tr>
        </thead>
        <tbody>
          {group.lines.map((l) => (
            <tr key={l.key} className="h-9 print:h-[8mm]">
              <td className={`${td} whitespace-nowrap font-semibold`}>{l.location}</td>
              <td className={`${td} whitespace-nowrap`}>{l.sku}</td>
              <td className={td}>{l.description}</td>
              <td className={td}>{l.uom}</td>
              {!blind && (
                <td className={`${td} whitespace-nowrap text-right font-semibold`}>
                  {fmtQty(l.qty_system)}
                  <Flag line={l} />
                </td>
              )}
              <td className={td} />
              <td className={td} />
              {cols.batch && <td className={`${td} ${small}`}>{l.batch_no}{l.lots > 1 ? ` (${l.lots} lot)` : ''}</td>}
              {cols.manuf && <td className={`${td} ${small}`}>{fmtDate(l.manuf_date)}</td>}
              {cols.receive && <td className={`${td} ${small}`}>{fmtDate(l.receive_date)}</td>}
              {cols.expiry && <td className={`${td} ${small}`}>{fmtDate(l.expiry_date)}</td>}
              {cols.condition && <td className={`${td} ${small} ${l.condition && l.condition !== 'GOOD' ? 'font-bold' : ''}`}>{l.condition}</td>}
              {cols.note && <td className={td} />}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SheetCards({ group, prefs }: { group: SheetGroup; prefs: Prefs }) {
  const { cols, blind } = prefs
  return (
    <section className="space-y-2 md:hidden print:hidden">
      <h3 className="sticky top-0 bg-slate-100 px-2 py-2 text-lg font-bold">Dãy {group.name} · {group.lines.length} dòng</h3>
      {group.lines.map((l) => (
        <article key={l.key} className="rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xl font-bold">{l.location || '—'}</p>
            {!blind && (
              <p className="text-right text-xl font-bold">
                {fmtQty(l.qty_system)} <span className="text-base font-normal">{l.uom}</span>
                <Flag line={l} />
              </p>
            )}
          </div>
          <p className="font-semibold">{l.sku}</p>
          <p className="text-slate-700">{l.description}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm text-slate-600">
            {cols.batch && l.batch_no && <div><dt className="inline">Batch: </dt><dd className="inline">{l.batch_no}{l.lots > 1 ? ` (${l.lots} lot)` : ''}</dd></div>}
            {cols.condition && l.condition && <div><dt className="inline">Tình trạng: </dt><dd className="inline font-semibold">{l.condition}</dd></div>}
            {cols.manuf && l.manuf_date && <div><dt className="inline">SX: </dt><dd className="inline">{fmtDate(l.manuf_date)}</dd></div>}
            {cols.receive && l.receive_date && <div><dt className="inline">Nhập: </dt><dd className="inline">{fmtDate(l.receive_date)}</dd></div>}
            {cols.expiry && l.expiry_date && <div><dt className="inline">HSD: </dt><dd className="inline">{fmtDate(l.expiry_date)}</dd></div>}
          </dl>
        </article>
      ))}
    </section>
  )
}

async function exportExcel(groups: SheetGroup[], prefs: Prefs, name: string) {
  const XLSX = await import('xlsx')
  const header = ['Dãy kệ', 'Vị trí', 'SKU', 'Tên hàng', 'ĐVT']
  if (!prefs.blind) header.push('SL hệ thống')
  header.push('SL thực đếm', 'Chênh lệch')
  if (prefs.cols.batch) header.push('Batch No')
  if (prefs.cols.manuf) header.push('Ngày SX')
  if (prefs.cols.receive) header.push('Ngày nhập')
  if (prefs.cols.expiry) header.push('Hạn dùng')
  if (prefs.cols.condition) header.push('Tình trạng')
  if (prefs.cols.note) header.push('Ghi chú')
  const rows: (string | number)[][] = [header]
  for (const g of groups)
    for (const l of g.lines) {
      const r: (string | number)[] = [g.name, l.location, l.sku, l.description, l.uom]
      if (!prefs.blind) r.push(l.qty_system ?? '')
      r.push('', '')
      if (prefs.cols.batch) r.push(l.batch_no)
      if (prefs.cols.manuf) r.push(fmtDate(l.manuf_date))
      if (prefs.cols.receive) r.push(fmtDate(l.receive_date))
      if (prefs.cols.expiry) r.push(fmtDate(l.expiry_date))
      if (prefs.cols.condition) r.push(l.condition)
      if (prefs.cols.note) r.push('')
      rows.push(r)
    }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = header.map((h) => ({ wch: h === 'Tên hàng' ? 40 : h === 'Ghi chú' ? 24 : 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Phiếu kiểm')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(`phieu-kiem-${name}-${today()}.xlsx`, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

export default function InventoryCheckPage() {
  const data = useSourceRows('wa.check.source')
  const [prefs, setPrefs] = usePersisted<Prefs>('wa.check.prefs', DEFAULT_PREFS)
  const [filters, setFilters] = useState({ warehouse: '', rack: '', category: '', condition: '', locationText: '' })

  const opts: SheetOptions = { ...DEFAULT_OPTIONS, ...filters, merge: prefs.merge, blind: prefs.blind }
  const groups = useMemo(() => buildSheet(data.rows, opts, data.uomOf), [data.rows, data.uomOf, filters, prefs.merge]) // eslint-disable-line react-hooks/exhaustive-deps
  const lines = countLines(groups)
  const title = `Phiếu kiểm kho · ${data.source?.name ?? ''} · ${fmtDate(today())}`

  const warehouses = useMemo(() => distinct(data.rows, (r) => r.warehouse), [data.rows])
  const racks = useMemo(() => distinct(data.rows, (r) => rackGroup(r.location)), [data.rows])
  const categories = useMemo(() => distinct(data.rows, (r) => r.category), [data.rows])
  const conditions = useMemo(() => distinct(data.rows, (r) => r.condition), [data.rows])

  const sel = (label: string, k: keyof typeof filters, options: string[]) =>
    options.length === 0 ? null : (
      <Field label={label}>
        <select className={inputClass} value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}>
          <option value="">Tất cả</option>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>
    )

  if (data.noData) return <NoDataNotice />

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        {data.error && <Notice kind="error">{data.error}</Notice>}
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nguồn dữ liệu">
              <select className={inputClass} value={data.source?.id ?? ''} onChange={(e) => { data.setSourceId(Number(e.target.value)); setFilters({ warehouse: '', rack: '', category: '', condition: '', locationText: '' }) }}>
                {data.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {sel("Kho", "warehouse", warehouses)}
            {racks.length > 1 && sel("Dãy kệ", "rack", racks)}
            {sel("Nhóm hàng", "category", categories)}
            {sel("Tình trạng", "condition", conditions)}
            <Field label="Vị trí chứa…">
              <input className={inputClass} value={filters.locationText} placeholder="vd: A01" onChange={(e) => setFilters((f) => ({ ...f, locationText: e.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={prefs.merge} onChange={(e) => setPrefs((p) => ({ ...p, merge: e.target.checked }))} />
              Gộp theo (Vị trí, SKU, Batch)
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={prefs.blind} onChange={(e) => setPrefs((p) => ({ ...p, blind: e.target.checked }))} />
              Kiểm mù (ẩn SL hệ thống)
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="text-sm font-medium text-slate-700">Cột in:</span>
            {(Object.keys(COL_LABELS) as (keyof Prefs['cols'])[]).map((k) => (
              <label key={k} className="flex min-h-9 items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4" checked={prefs.cols[k]} onChange={(e) => setPrefs((p) => ({ ...p, cols: { ...p.cols, [k]: e.target.checked } }))} />
                {COL_LABELS[k]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="primary" disabled={lines === 0} onClick={() => printPage('landscape')}>In A4 ngang / Lưu PDF</Button>
            <Button disabled={lines === 0} onClick={() => exportExcel(groups, prefs, data.source?.name ?? 'kiem-kho')}>Xuất Excel</Button>
            <span className="text-slate-600">{lines} dòng · {groups.length} dãy kệ</span>
          </div>
          <p className="text-sm text-slate-500">Muốn lưu PDF: bấm In rồi chọn máy in “Lưu thành PDF”. Chọn khổ A4, lề mặc định.</p>
        </Card>
        {data.loading && <Notice>Đang tải…</Notice>}
        {!data.loading && lines === 0 && <Notice kind="warn">Không có dòng nào khớp bộ lọc.</Notice>}
      </div>

      {groups.map((g) => (
        <div key={g.name} className="rack-group space-y-2">
          <SheetCards group={g} prefs={prefs} />
          <SheetTable group={g} title={title} prefs={prefs} />
        </div>
      ))}
    </div>
  )
}
