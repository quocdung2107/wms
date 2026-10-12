import { useEffect, useState } from 'react'
import { bestSheet, excel } from '../../shared/excel/client.ts'
import { assertFileSize, type SheetData, type TableData } from '../../shared/excel/reader.ts'
import { replaceSkuWeights } from '../../shared/inventory/repo.ts'
import { parseWeightSheet } from '../../shared/inventory/weight.ts'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui.tsx'

interface Props {
  file: File
  onDone: (message: string) => void
  onCancel: () => void
}

const guess = (headers: string[], re: RegExp) => {
  const i = headers.findIndex((h) => re.test(h))
  return i < 0 ? '' : String(i)
}

export default function WeightWizard({ file, onDone, onCancel }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [sheets, setSheets] = useState<{ name: string; rows: number }[]>([])
  const [sheet, setSheet] = useState('')
  const [headerRow, setHeaderRow] = useState(0)
  const [table, setTable] = useState<TableData>({ headers: [], rows: [] })
  const [skuCol, setSkuCol] = useState('')
  const [kgCol, setKgCol] = useState('')

  async function loadTable(sh: string, hdr: number) {
    const t = await excel.table(sh, { headerRow: hdr, headerRows: 1 })
    setSheet(sh)
    setHeaderRow(hdr)
    setTable(t)
    setSkuCol(guess(t.headers, /sku|mã\s*(hàng|sp|vt)|item|part/i))
    setKgCol(guess(t.headers, /kg|khối\s*lượng|trọng\s*lượng|weight/i))
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        assertFileSize(file.size)
        const names = await excel.open(await file.arrayBuffer())
        if (!alive) return
        setSheets(names)
        await loadTable(await bestSheet(names), 0)
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

  const ready = skuCol !== '' && kgCol !== '' && skuCol !== kgCol
  const parsed = ready
    ? parseWeightSheet(
        { name: sheet, matrix: [table.headers, ...table.rows], merges: [], formulaCols: [] } as SheetData,
        Number(skuCol),
        Number(kgCol),
        0,
      )
    : null

  async function load() {
    if (!parsed) return
    setBusy(true)
    setError('')
    try {
      if (parsed.rows.length === 0) throw new Error('Không đọc được SKU nào có khối lượng. Kiểm tra cột SKU và cột kg.')
      await replaceSkuWeights(parsed.rows)
      onDone(`Đã nạp ${parsed.rows.length} SKU có khối lượng` + (parsed.skipped ? ` (bỏ ${parsed.skipped} dòng thiếu SKU hoặc kg).` : '.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const colSelect = (value: string, set: (v: string) => void) => (
    <select className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">— chọn cột —</option>
      {table.headers.map((h, i) => (
        <option key={i} value={i}>{h || `Cột ${i + 1}`} — {String(table.rows[0]?.[i] ?? '')}</option>
      ))}
    </select>
  )

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Nạp file khối lượng: {file.name}</h2>
      {error && <Notice kind="error">{error}</Notice>}
      {busy && <Notice>Đang xử lý…</Notice>}
      {sheets.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sheet">
              <select className={inputClass} value={sheet} onChange={(e) => loadTable(e.target.value, 0).catch((x) => setError(String(x.message ?? x)))}>
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.rows} dòng)</option>
                ))}
              </select>
            </Field>
            <Field label="Dòng tiêu đề (số dòng trong file)">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={headerRow + 1}
                onChange={(e) => loadTable(sheet, Math.max(0, Number(e.target.value) - 1)).catch((x) => setError(String(x.message ?? x)))}
              />
            </Field>
            <Field label="Cột SKU">{colSelect(skuCol, setSkuCol)}</Field>
            <Field label="Cột khối lượng (kg)">{colSelect(kgCol, setKgCol)}</Field>
          </div>
          {parsed && (
            <Notice>
              Đọc được <b>{parsed.rows.length}</b> SKU có khối lượng (bỏ {parsed.skipped} dòng). Nạp sẽ <b>thay toàn bộ</b> bảng khối lượng cũ.
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" onClick={load} disabled={busy || !ready}>Nạp (thay bản cũ)</Button>
            <Button onClick={onCancel}>Huỷ</Button>
          </div>
        </>
      )}
      {sheets.length === 0 && !busy && <Button onClick={onCancel}>Đóng</Button>}
    </Card>
  )
}
