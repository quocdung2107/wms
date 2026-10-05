import { useMemo, useState } from 'react'
import { NoDataNotice, useSourceRows } from '../../shared/inventory/hooks.tsx'
import { buildSheet, DEFAULT_OPTIONS, distinct, fmtDate, rackGroup, type SheetLine } from '../../shared/inventory/sheet.ts'
import { Code, type CodeType } from '../../shared/ui/Code.tsx'
import { Button, Card, Field, inputClass, Notice, printPage, usePersisted } from '../../shared/ui/ui.tsx'

type Item = { key: string; location: string; sku: string; batch: string; description: string; expiry: string }
type Prefs = {
  mode: 'line' | 'location'
  perPage: 1 | 2 | 4 | 8
  show: { location: boolean; sku: boolean; batch: boolean; description: boolean; expiry: boolean }
  code: 'none' | 'location' | 'sku' | 'batch'
  codeType: CodeType
}
const DEFAULT_PREFS: Prefs = {
  mode: 'line',
  perPage: 4,
  show: { location: true, sku: true, batch: true, description: true, expiry: false },
  code: 'none',
  codeType: 'code128',
}

// Cỡ chữ (pt) theo số nhãn / trang A4 dọc; lưới cột × hàng.
const LAYOUT = {
  1: { cols: 1, rows: 1, loc: 90, sku: 50, batch: 40, desc: 24, code: '40mm' },
  2: { cols: 1, rows: 2, loc: 80, sku: 42, batch: 34, desc: 20, code: '30mm' },
  4: { cols: 2, rows: 2, loc: 40, sku: 26, batch: 22, desc: 14, code: '28mm' },
  8: { cols: 2, rows: 4, loc: 30, sku: 18, batch: 16, desc: 11, code: '18mm' },
} as const

const SHOW_LABELS: Record<keyof Prefs['show'], string> = {
  location: 'Vị trí',
  sku: 'SKU',
  batch: 'Batch',
  description: 'Tên hàng',
  expiry: 'Hạn dùng',
}

function LabelCell({ item, prefs }: { item: Item; prefs: Prefs }) {
  const L = LAYOUT[prefs.perPage]
  const { show } = prefs
  const codeValue = prefs.code === 'none' ? '' : item[prefs.code === 'batch' ? 'batch' : prefs.code]
  return (
    <div className="flex flex-col items-center justify-center gap-1 overflow-hidden border border-dashed border-slate-400 p-[3mm] text-center leading-tight">
      {show.location && item.location && <p className="break-all font-black" style={{ fontSize: `${L.loc}pt` }}>{item.location}</p>}
      {show.sku && item.sku && <p className="break-all font-extrabold" style={{ fontSize: `${L.sku}pt` }}>{item.sku}</p>}
      {show.batch && item.batch && <p className="break-all font-bold" style={{ fontSize: `${L.batch}pt` }}>Lô {item.batch}</p>}
      {show.description && item.description && <p className="line-clamp-2" style={{ fontSize: `${L.desc}pt` }}>{item.description}</p>}
      {show.expiry && item.expiry && <p style={{ fontSize: `${L.desc}pt` }}>HSD {fmtDate(item.expiry)}</p>}
      {codeValue && (
        <div style={{ height: prefs.codeType === 'qr' ? L.code : undefined, width: prefs.codeType === 'qr' ? L.code : '90%' }}>
          <Code type={prefs.codeType} value={codeValue} className={prefs.codeType === 'qr' ? 'h-full w-full' : 'h-[12mm] w-full'} />
        </div>
      )}
    </div>
  )
}

export default function LabelMakerPage() {
  const data = useSourceRows('wa.label.source')
  const [prefs, setPrefs] = usePersisted<Prefs>('wa.label.prefs', DEFAULT_PREFS)
  const [filters, setFilters] = useState({ warehouse: '', rack: '', category: '', condition: '', locationText: '' })
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const items: Item[] = useMemo(() => {
    const groups = buildSheet(data.rows, { ...DEFAULT_OPTIONS, ...filters }, data.uomOf)
    const lines: SheetLine[] = groups.flatMap((g) => g.lines)
    if (prefs.mode === 'location') {
      const seen = new Set<string>()
      const out: Item[] = []
      for (const l of lines) {
        if (!l.location || seen.has(l.location)) continue
        seen.add(l.location)
        out.push({ key: l.location, location: l.location, sku: '', batch: '', description: '', expiry: '' })
      }
      return out
    }
    return lines.map((l) => ({ key: l.key, location: l.location, sku: l.sku, batch: l.batch_no, description: l.description, expiry: l.expiry_date }))
  }, [data.rows, data.uomOf, filters, prefs.mode])

  const chosen = items.filter((i) => !excluded.has(i.key))
  const L = LAYOUT[prefs.perPage]
  const per = L.cols * L.rows
  const pages: Item[][] = []
  for (let i = 0; i < chosen.length; i += per) pages.push(chosen.slice(i, i + per))

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
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nguồn dữ liệu">
              <select className={inputClass} value={data.source?.id ?? ''} onChange={(e) => { data.setSourceId(Number(e.target.value)); setExcluded(new Set()) }}>
                {data.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {sel('Kho', 'warehouse', warehouses)}
            {racks.length > 1 && sel('Dãy kệ', 'rack', racks)}
            {sel('Nhóm hàng', 'category', categories)}
            {sel('Tình trạng', 'condition', conditions)}
            <Field label="Vị trí chứa…">
              <input className={inputClass} value={filters.locationText} onChange={(e) => setFilters((f) => ({ ...f, locationText: e.target.value }))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mỗi nhãn là">
              <select className={inputClass} value={prefs.mode} onChange={(e) => { setPrefs((p) => ({ ...p, mode: e.target.value as Prefs['mode'] })); setExcluded(new Set()) }}>
                <option value="line">Một dòng hàng (vị trí + SKU + lô)</option>
                <option value="location">Một vị trí (đánh dấu kệ/pallet)</option>
              </select>
            </Field>
            <Field label="Số nhãn trên một trang A4">
              <select className={inputClass} value={prefs.perPage} onChange={(e) => setPrefs((p) => ({ ...p, perPage: Number(e.target.value) as Prefs['perPage'] }))}>
                {[1, 2, 4, 8].map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Mã vạch / QR của">
              <select className={inputClass} value={prefs.code} onChange={(e) => setPrefs((p) => ({ ...p, code: e.target.value as Prefs['code'] }))}>
                <option value="none">Không in mã</option>
                <option value="location">Vị trí</option>
                <option value="sku">SKU</option>
                <option value="batch">Batch</option>
              </select>
            </Field>
            <Field label="Loại mã">
              <select className={inputClass} value={prefs.codeType} onChange={(e) => setPrefs((p) => ({ ...p, codeType: e.target.value as CodeType }))}>
                <option value="code128">Code128</option>
                <option value="qr">QR</option>
              </select>
            </Field>
          </div>
          {prefs.mode === 'line' && (
            <div className="flex flex-wrap gap-x-5">
              <span className="text-sm font-medium text-slate-700">Chữ trên nhãn:</span>
              {(Object.keys(SHOW_LABELS) as (keyof Prefs['show'])[]).map((k) => (
                <label key={k} className="flex min-h-9 items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-4" checked={prefs.show[k]} onChange={(e) => setPrefs((p) => ({ ...p, show: { ...p.show, [k]: e.target.checked } }))} />
                  {SHOW_LABELS[k]}
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="primary" disabled={chosen.length === 0} onClick={() => printPage('portrait')}>In A4 / Lưu PDF</Button>
            <Button onClick={() => setExcluded(new Set())}>Chọn tất cả</Button>
            <Button onClick={() => setExcluded(new Set(items.map((i) => i.key)))}>Bỏ chọn tất cả</Button>
            <span className="text-slate-600">{chosen.length}/{items.length} nhãn · {pages.length} trang</span>
          </div>
        </Card>

        <details className="rounded-xl bg-white p-4 shadow-sm">
          <summary className="min-h-9 cursor-pointer font-medium">Chọn nhãn cần in ({chosen.length}/{items.length})</summary>
          <ul className="mt-2 grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => (
              <li key={i.key}>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5" checked={!excluded.has(i.key)} onChange={(e) => setExcluded((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.key); else n.add(i.key); return n })} />
                  <span>{[i.location, i.sku, i.batch].filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
        {chosen.length === 0 && <Notice kind="warn">Chưa chọn nhãn nào.</Notice>}
        <p className="text-sm text-slate-500">Xem trước thu nhỏ. Khi in chọn khổ A4 dọc, tỉ lệ 100%, lề mặc định.</p>
      </div>

      <div className="space-y-4 print:space-y-0">
        {pages.map((page, pi) => (
          <div key={pi} className="label-sheet mx-auto bg-white shadow-sm [zoom:0.4] sm:[zoom:0.7] lg:[zoom:0.9] print:shadow-none print:[zoom:1]" style={{ width: '194mm', height: '279mm' }}>
            <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${L.cols}, 1fr)`, gridTemplateRows: `repeat(${L.rows}, 1fr)` }}>
              {Array.from({ length: per }, (_, i) => page[i] ? <LabelCell key={page[i].key} item={page[i]} prefs={prefs} /> : <div key={`e${i}`} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
