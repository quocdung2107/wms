import { useMemo, useRef, useState } from 'react'
import { bestSheet, excel } from '../../shared/excel/client.ts'
import type { HeaderInfo, TableData } from '../../shared/excel/reader.ts'
import { Button, Card, downloadBlob, Field, inputClass, Notice, usePersisted } from '../../shared/ui/ui.tsx'
import { applySteps, csvSafe, describe, OP_LABELS, type FilterOp, type Step } from './formatter.ts'

type StepType = Step['type']
const TYPE_LABELS: Record<StepType, string> = {
  rename: 'Đổi tên cột',
  delete: 'Xoá cột',
  move: 'Dời cột',
  filter: 'Lọc dòng',
  sort: 'Sắp xếp',
  group: 'Nhóm và cộng',
  split: 'Tách cột',
  merge: 'Gộp cột',
}
const PREVIEW_ROWS = 100

function MultiPick({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex max-h-40 flex-wrap gap-x-4 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2">
      {options.map((o) => (
        <label key={o} className="flex min-h-9 items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </div>
  )
}

function StepForm({ headers, onAdd }: { headers: string[]; onAdd: (s: Step) => void }) {
  const [type, setType] = useState<StepType>('filter')
  const [col, setCol] = useState('')
  const [cols, setCols] = useState<string[]>([])
  const [sum, setSum] = useState<string[]>([])
  const [text, setText] = useState('')
  const [op, setOp] = useState<FilterOp>('contains')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [sep, setSep] = useState(' ')
  const c = col && headers.includes(col) ? col : (headers[0] ?? '')

  const build = (): Step | null => {
    switch (type) {
      case 'rename': return text.trim() ? { type, col: c, name: text } : null
      case 'delete': return cols.length ? { type, cols } : null
      case 'move': return { type, col: c, dir: dir === 'asc' ? 'left' : 'right' }
      case 'filter': return { type, col: c, op, value: text }
      case 'sort': return { type, col: c, dir }
      case 'group': return cols.length ? { type, by: cols, sum: sum.filter((x) => !cols.includes(x)) } : null
      case 'split': return text ? { type, col: c, delimiter: text } : null
      case 'merge': return cols.length >= 2 && text.trim() ? { type, cols, sep, name: text } : null
    }
  }
  const step = build()
  const colSelect = (
    <Field label="Cột">
      <select className={inputClass} value={c} onChange={(e) => setCol(e.target.value)}>
        {headers.map((h) => <option key={h}>{h}</option>)}
      </select>
    </Field>
  )

  return (
    <Card className="space-y-3">
      <Field label="Thao tác">
        <select className={inputClass} value={type} onChange={(e) => { setType(e.target.value as StepType); setText(''); setCols([]); setSum([]) }}>
          {(Object.keys(TYPE_LABELS) as StepType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {(type === 'rename' || type === 'filter' || type === 'sort' || type === 'move' || type === 'split') && colSelect}
        {type === 'rename' && <Field label="Tên mới"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
        {type === 'filter' && (
          <>
            <Field label="Điều kiện">
              <select className={inputClass} value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
                {(Object.keys(OP_LABELS) as FilterOp[]).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
              </select>
            </Field>
            {op !== 'empty' && op !== 'nonempty' && <Field label="Giá trị"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
          </>
        )}
        {type === 'sort' && (
          <Field label="Thứ tự">
            <select className={inputClass} value={dir} onChange={(e) => setDir(e.target.value as 'asc' | 'desc')}>
              <option value="asc">Tăng dần</option>
              <option value="desc">Giảm dần</option>
            </select>
          </Field>
        )}
        {type === 'move' && (
          <Field label="Hướng">
            <select className={inputClass} value={dir} onChange={(e) => setDir(e.target.value as 'asc' | 'desc')}>
              <option value="asc">Sang trái</option>
              <option value="desc">Sang phải</option>
            </select>
          </Field>
        )}
        {type === 'split' && <Field label="Ký tự tách (vd: - hoặc ,)"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
        {type === 'merge' && (
          <>
            <Field label="Tên cột mới"><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <Field label="Ký tự nối"><input className={inputClass} value={sep} onChange={(e) => setSep(e.target.value)} /></Field>
          </>
        )}
      </div>
      {(type === 'delete' || type === 'group' || type === 'merge') && (
        <Field label={type === 'delete' ? 'Cột cần xoá' : type === 'group' ? 'Nhóm theo các cột' : 'Các cột cần gộp (theo thứ tự tick)'}>
          <MultiPick options={headers} value={cols} onChange={setCols} />
        </Field>
      )}
      {type === 'group' && (
        <Field label="Cộng tổng các cột số">
          <MultiPick options={headers.filter((h) => !cols.includes(h))} value={sum} onChange={setSum} />
        </Field>
      )}
      <Button kind="primary" disabled={!step} onClick={() => step && onAdd(step)}>Thêm bước</Button>
    </Card>
  )
}

export default function ExcelFormatterPage() {
  const picker = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string } | null>(null)
  const [sheets, setSheets] = useState<{ name: string; rows: number }[]>([])
  const [sheet, setSheet] = useState('')
  const [info, setInfo] = useState<HeaderInfo>({ headerRow: 0, headerRows: 1 })
  const [source, setSource] = useState<TableData | null>(null)
  const [error, setError] = useState('')
  const [steps, setSteps] = usePersisted<{ list: Step[] }>('wa.excel.steps', { list: [] })

  async function loadTable(sh: string, hdr?: HeaderInfo) {
    const r = await excel.inspect(sh, hdr)
    setSheet(sh)
    setInfo(r.info)
    setSource(await excel.table(sh, r.info))
  }

  async function onFile(f: File) {
    setError('')
    try {
      const names = await excel.open(await f.arrayBuffer())
      setFile({ name: f.name })
      setSheets(names)
      await loadTable(await bestSheet(names))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const result = useMemo(() => (source ? applySteps(source, steps.list) : null), [source, steps.list])

  async function exportFile(kind: 'xlsx' | 'csv') {
    if (!result) return
    const XLSX = await import('xlsx')
    const { headers, rows } = result.table
    const base = (file?.name ?? 'bang').replace(/\.[^.]+$/, '') + '-da-xu-ly'
    if (kind === 'csv') {
      const ws = XLSX.utils.aoa_to_sheet([headers.map(csvSafe), ...rows.map((r) => r.map(csvSafe))])
      downloadBlob(`${base}.csv`, '﻿' + XLSX.utils.sheet_to_csv(ws), 'text/csv;charset=utf-8')
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      downloadBlob(`${base}.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Mở một file Excel/CSV, thêm các bước (lọc, sắp xếp, đổi tên, xoá, nhóm, tách, gộp) rồi xuất file mới. Các bước
        được nhớ để lần sau dùng lại cho file cùng dạng.
      </p>
      <input ref={picker} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <Button kind="primary" onClick={() => picker.current?.click()}>{file ? 'Mở file khác' : 'Mở file Excel/CSV'}</Button>
      {error && <Notice kind="error">{error}</Notice>}

      {source && result && (
        <>
          <Card className="space-y-3">
            <p className="font-semibold">{file?.name}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Sheet">
                <select className={inputClass} value={sheet} onChange={(e) => loadTable(e.target.value)}>
                  {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Dòng tiêu đề">
                <input className={inputClass} type="number" min={1} value={info.headerRow + 1} onChange={(e) => loadTable(sheet, { ...info, headerRow: Math.max(0, Number(e.target.value) - 1) })} />
              </Field>
              <Field label="Số dòng tiêu đề">
                <input className={inputClass} type="number" min={1} max={3} value={info.headerRows} onChange={(e) => loadTable(sheet, { ...info, headerRows: Math.min(3, Math.max(1, Number(e.target.value))) })} />
              </Field>
            </div>
            <p className="text-sm text-slate-600">{source.rows.length} dòng gốc, {source.headers.length} cột (cột và dòng trống đã bỏ).</p>
          </Card>

          <h2 className="text-lg font-semibold">Các bước</h2>
          {steps.list.length === 0 && <p className="text-slate-600">Chưa có bước nào.</p>}
          <ol className="space-y-2">
            {steps.list.map((s, i) => (
              <li key={i} className={`flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm ${result.failed.includes(i) ? 'ring-2 ring-amber-400' : ''}`}>
                <span>
                  {i + 1}. {describe(s)}
                  {result.failed.includes(i) && <span className="ml-2 text-sm font-semibold text-amber-800">(bỏ qua: file này không có cột đó)</span>}
                </span>
                <Button kind="danger" aria-label={`Xoá bước ${i + 1}`} onClick={() => setSteps((p) => ({ list: p.list.filter((_, k) => k !== i) }))}>Xoá</Button>
              </li>
            ))}
          </ol>
          <StepForm headers={result.table.headers} onAdd={(s) => setSteps((p) => ({ list: [...p.list, s] }))} />
          {steps.list.length > 0 && <Button kind="danger" onClick={() => setSteps({ list: [] })}>Xoá hết các bước</Button>}

          <h2 className="text-lg font-semibold">Kết quả: {result.table.rows.length} dòng × {result.table.headers.length} cột</h2>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" onClick={() => exportFile('xlsx')}>Xuất Excel</Button>
            <Button onClick={() => exportFile('csv')}>Xuất CSV</Button>
          </div>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-100">
                  {result.table.headers.map((h) => <th key={h} className="whitespace-nowrap border-b px-2 py-2 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.table.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {r.map((v, k) => <td key={k} className="whitespace-nowrap px-2 py-1">{v ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.table.rows.length > PREVIEW_ROWS && <p className="text-sm text-slate-600">Hiện {PREVIEW_ROWS} dòng đầu; file xuất có đủ {result.table.rows.length} dòng.</p>}
        </>
      )}
    </div>
  )
}
