import { useMemo, useState } from 'react'
import { NoDataNotice, useSourceRows } from '../../shared/inventory/hooks.tsx'
import { distinct, naturalCompare } from '../../shared/inventory/sheet.ts'
import { Code, type CodeType } from '../../shared/ui/Code.tsx'
import { Button, Card, Field, inputClass, printPage, usePersisted } from '../../shared/ui/ui.tsx'

type FieldKey = 'sku' | 'location' | 'batch_no'
const FIELD_NAMES: Record<FieldKey, string> = { sku: 'SKU', location: 'Vị trí', batch_no: 'Batch No' }

export default function BarcodePage() {
  const data = useSourceRows('wa.barcode.source')
  const [prefs, setPrefs] = usePersisted('wa.barcode.prefs', { type: 'code128' as CodeType, cols: 3, caption: true, from: 'data' as 'data' | 'text' })
  const [field, setField] = useState<FieldKey>('sku')
  const [filter, setFilter] = useState('')
  const [manual, setManual] = useState('')

  const fromData = useMemo(
    () => distinct(data.rows, (r) => r[field]).sort(naturalCompare).filter((v) => !filter || v.toLowerCase().includes(filter.toLowerCase())),
    [data.rows, field, filter],
  )
  const values = prefs.from === 'data' ? fromData : [...new Set(manual.split('\n').map((s) => s.trim()).filter(Boolean))]
  const capped = values.slice(0, 500)

  return (
    <div className="space-y-4">
      <Card className="no-print space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Loại mã">
            <select className={inputClass} value={prefs.type} onChange={(e) => setPrefs((p) => ({ ...p, type: e.target.value as CodeType }))}>
              <option value="code128">Code128 (mã vạch)</option>
              <option value="qr">QR</option>
            </select>
          </Field>
          <Field label="Số mã trên một hàng">
            <select className={inputClass} value={prefs.cols} onChange={(e) => setPrefs((p) => ({ ...p, cols: Number(e.target.value) }))}>
              {[2, 3, 4].map((n) => <option key={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Lấy mã từ">
            <select className={inputClass} value={prefs.from} onChange={(e) => setPrefs((p) => ({ ...p, from: e.target.value as 'data' | 'text' }))}>
              <option value="data">Dữ liệu đã nạp</option>
              <option value="text">Gõ tay (mỗi dòng một mã)</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end">
            <input type="checkbox" className="size-5" checked={prefs.caption} onChange={(e) => setPrefs((p) => ({ ...p, caption: e.target.checked }))} />
            Hiện chữ dưới mã
          </label>
        </div>

        {prefs.from === 'data' ? (
          data.noData ? (
            <NoDataNotice />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nguồn">
                <select className={inputClass} value={data.source?.id ?? ''} onChange={(e) => data.setSourceId(Number(e.target.value))}>
                  {data.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="In mã của">
                <select className={inputClass} value={field} onChange={(e) => setField(e.target.value as FieldKey)}>
                  {(Object.keys(FIELD_NAMES) as FieldKey[]).map((k) => <option key={k} value={k}>{FIELD_NAMES[k]}</option>)}
                </select>
              </Field>
              <Field label="Lọc (chứa…)">
                <input className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)} />
              </Field>
            </div>
          )
        ) : (
          <Field label="Danh sách mã">
            <textarea className={`${inputClass} min-h-32 font-mono`} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={'DS-A01-1\nDS-A01-2'} />
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button kind="primary" disabled={capped.length === 0} onClick={() => printPage('portrait')}>In A4 / Lưu PDF</Button>
          <span className="text-slate-600">
            {values.length} mã{values.length > capped.length ? ` (chỉ in 500 mã đầu — hãy lọc bớt)` : ''}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 print:gap-3" style={{ gridTemplateColumns: `repeat(${prefs.cols}, minmax(0, 1fr))` }}>
        {capped.map((v) => (
          <figure key={v} className="break-inside-avoid rounded-lg border border-slate-300 bg-white p-3 text-center">
            <Code type={prefs.type} value={v} className={prefs.type === 'qr' ? 'mx-auto w-3/4' : 'h-16 w-full'} />
            {prefs.caption && <figcaption className="mt-1 break-all text-base font-bold">{v}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  )
}
