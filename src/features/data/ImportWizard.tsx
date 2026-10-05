import { useEffect, useState } from 'react'
import { bestSheet, excel } from '../../shared/excel/client.ts'
import {
  assertFileSize, colLetter, resolveMapping, STD_FIELDS, suggestMapping,
  type Column, type ExtractResult, type HeaderInfo, type Mapping, type StdField,
} from '../../shared/excel/reader.ts'
import { FIELD_LABELS } from '../../shared/inventory/labels.ts'
import { replaceRows, saveSource, type SavedMapping, type Source } from '../../shared/inventory/repo.ts'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui.tsx'

interface Props {
  file: File
  sources: Source[]
  forSource?: Source // nạp lại cho một nguồn đã có
  onDone: (message: string) => void
  onCancel: () => void
}

export default function ImportWizard({ file, sources, forSource, onDone, onCancel }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [sheetNames, setSheetNames] = useState<{ name: string; rows: number }[]>([])
  const [sheet, setSheet] = useState('')
  const [info, setInfo] = useState<HeaderInfo>({ headerRow: 0, headerRows: 1 })
  const [columns, setColumns] = useState<Column[]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [name, setName] = useState(forSource?.name ?? file.name.replace(/\.[^.]+$/, ''))
  const [recognized, setRecognized] = useState<Source | null>(null)
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState<ExtractResult | null>(null)

  async function inspect(sh: string, hdr?: HeaderInfo) {
    const r = await excel.inspect(sh, hdr)
    setSheet(sh)
    setInfo(r.info)
    setColumns(r.columns)
    setMapping(suggestMapping(r.columns))
  }

  // Mở file; thử nhận ra hồ sơ nguồn đã lưu.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        assertFileSize(file.size)
        const names = await excel.open(await file.arrayBuffer())
        if (!alive) return
        setSheetNames(names)
        const candidates = forSource ? [forSource] : sources
        for (const p of candidates) {
          if (!names.some((n) => n.name === p.sheet)) continue
          const r = await excel.inspect(p.sheet, { headerRow: p.header_row, headerRows: p.header_rows })
          const m = resolveMapping(p.mapping, r.columns)
          if (m) {
            setSheet(p.sheet)
            setInfo(r.info)
            setColumns(r.columns)
            setMapping(m)
            setName(p.name)
            setRecognized(p)
            setPreview(await excel.extract(p.sheet, r.info, m))
            return
          }
        }
        if (forSource) setError(`File này không khớp hồ sơ "${forSource.name}" (đổi tên cột hoặc sheet). Hãy ghép lại cột bên dưới.`)
        await inspect(await bestSheet(names))
        setEditing(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Xem trước mỗi khi ghép cột đổi (trong chế độ chỉnh).
  useEffect(() => {
    if (!editing || !sheet) return
    if (mapping.sku === undefined) {
      setPreview(null)
      return
    }
    let alive = true
    excel.extract(sheet, info, mapping).then((r) => alive && setPreview(r), () => {})
    return () => {
      alive = false
    }
  }, [editing, mapping, info, sheet])

  async function load() {
    setBusy(true)
    setError('')
    try {
      const labels: SavedMapping = {}
      for (const f of STD_FIELDS) {
        const idx = mapping[f]
        if (idx !== undefined) labels[f] = columns[idx].label
      }
      const result = await excel.extract(sheet, info, mapping)
      if (result.rows.length === 0) throw new Error('Không đọc được dòng nào có SKU. Kiểm tra dòng tiêu đề và cột SKU.')
      const id = await saveSource({ name: name.trim(), sheet, header_row: info.headerRow, header_rows: info.headerRows, mapping: labels })
      const skipped = `${result.skippedNoSku} dòng không có SKU, ${result.skippedTotal} dòng tổng`
      await replaceRows(id, result.rows, { file_name: file.name, skipped })
      onDone(`Đã nạp ${result.rows.length} dòng vào nguồn "${name.trim()}" (bỏ ${skipped}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const visibleCols = columns.filter((c) => !c.empty)
  const nameClash = !recognized && !forSource && sources.some((s) => s.name === name.trim())

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Nạp file: {file.name}</h2>
      {error && <Notice kind="error">{error}</Notice>}
      {busy && <Notice>Đang xử lý…</Notice>}

      {recognized && !editing && preview && (
        <div className="space-y-3">
          <Notice>
            Nhận ra nguồn <b>{recognized.name}</b>: {preview.rows.length} dòng hợp lệ (bỏ {preview.skippedNoSku} dòng không
            có SKU, {preview.skippedTotal} dòng tổng). Nạp sẽ <b>thay bản cũ</b> của nguồn này.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" onClick={load} disabled={busy}>Nạp (thay bản cũ)</Button>
            <Button onClick={() => setEditing(true)}>Chỉnh cột</Button>
            <Button onClick={onCancel}>Huỷ</Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sheet">
              <select className={inputClass} value={sheet} onChange={(e) => inspect(e.target.value)}>
                {sheetNames.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.rows} dòng)</option>
                ))}
              </select>
            </Field>
            <Field label="Dòng tiêu đề (số dòng trong file)">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={info.headerRow + 1}
                onChange={(e) => inspect(sheet, { ...info, headerRow: Math.max(0, Number(e.target.value) - 1) })}
              />
            </Field>
            <Field label="Số dòng tiêu đề (1–3)">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={3}
                value={info.headerRows}
                onChange={(e) => inspect(sheet, { ...info, headerRows: Math.min(3, Math.max(1, Number(e.target.value))) })}
              />
            </Field>
          </div>

          <p className="text-sm text-slate-600">
            Chọn cột trong file cho từng thông tin. Cột trống được ẩn; cột là công thức tự thêm được đánh dấu.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {STD_FIELDS.map((f: StdField) => (
              <Field key={f} label={FIELD_LABELS[f]}>
                <select
                  className={inputClass}
                  value={mapping[f] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m }
                      if (e.target.value === '') delete next[f]
                      else next[f] = Number(e.target.value)
                      return next
                    })
                  }
                >
                  <option value="">— không lấy —</option>
                  {visibleCols.map((c) => (
                    <option key={c.index} value={c.index}>
                      {colLetter(c.index)} · {c.label}
                      {c.formula ? ' (công thức)' : ''} — {c.samples[0] ?? ''}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>

          <Field label="Tên nguồn (app ghi nhớ để lần sau tự nhận)">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {nameClash && <Notice kind="warn">Đã có nguồn tên này — nạp sẽ thay dữ liệu của nguồn đó.</Notice>}

          {preview && (
            <div className="space-y-2">
              <Notice>
                Đọc được <b>{preview.rows.length}</b> dòng (bỏ {preview.skippedNoSku} dòng không có SKU,{' '}
                {preview.skippedTotal} dòng tổng).
              </Notice>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      {['Kho', 'Vị trí', 'SKU', 'Tên hàng', 'ĐVT', 'SL', 'Batch'].map((h) => (
                        <th key={h} className="px-2 py-1 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1">{r.warehouse}</td>
                        <td className="px-2 py-1">{r.location}</td>
                        <td className="px-2 py-1">{r.sku}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1">{r.uom_raw}</td>
                        <td className="px-2 py-1">{r.qty_system}</td>
                        <td className="px-2 py-1">{r.batch_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button kind="primary" onClick={load} disabled={busy || mapping.sku === undefined || !name.trim()}>
              Lưu hồ sơ nguồn và nạp
            </Button>
            <Button onClick={onCancel}>Huỷ</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
