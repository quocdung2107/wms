// Bộ đọc Excel/CSV: hàm thuần, chạy trong Web Worker (và chạy được trong Node để test).
import * as XLSX from 'xlsx'

export type Cell = string | number | null
export type Merge = { r1: number; c1: number; r2: number; c2: number }

export interface SheetData {
  name: string
  matrix: Cell[][]
  merges: Merge[]
  /** Cột mà phần lớn ô là công thức (người dùng tự thêm, vd VLOOKUP) */
  formulaCols: number[]
}

export interface HeaderInfo {
  headerRow: number // 0-based dòng đầu của tiêu đề
  headerRows: number // số dòng tiêu đề (1–3)
}

export interface Column {
  index: number
  label: string
  empty: boolean
  formula: boolean
  samples: string[]
}

export const STD_FIELDS = [
  'warehouse',
  'location',
  'sku',
  'description',
  'category',
  'uom_raw',
  'qty_system',
  'qty_available',
  'qty_damaged',
  'qty_hold',
  'condition',
  'batch_no',
  'lot_no',
  'manuf_date',
  'receive_date',
  'expiry_date',
] as const
export type StdField = (typeof STD_FIELDS)[number]

export type StdRow = {
  warehouse: string
  location: string
  sku: string
  description: string
  category: string
  uom_raw: string
  qty_system: number | null
  qty_available: number | null
  qty_damaged: number | null
  qty_hold: number | null
  condition: string
  batch_no: string
  lot_no: string
  manuf_date: string
  receive_date: string
  expiry_date: string
}

export type Mapping = Partial<Record<StdField, number>>

// ---------- đọc workbook ----------

const pad = (n: number) => String(n).padStart(2, '0')

export function serialToIso(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000))
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-6
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date
}

export function readWorkbook(buf: ArrayBuffer | Uint8Array): SheetData[] {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const isBinary = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)
  // CSV: giải mã UTF-8 rồi đọc chuỗi, giữ nguyên mã dạng text (không đoán kiểu số)
  const wb = isBinary
    ? XLSX.read(bytes, { type: 'array', cellNF: true })
    : XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', raw: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const matrix: Cell[][] = []
    const formulaCount: number[] = []
    const cellCount: number[] = []
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row: Cell[] = new Array(range.e.c + 1).fill(null)
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (!cell) continue
          let v: Cell = null
          if (cell.t === 'n') {
            v =
              typeof cell.z === 'string' && cell.z !== 'General' && XLSX.SSF.is_date(cell.z)
                ? serialToIso(cell.v as number)
                : (cell.v as number)
          } else if (cell.t === 's') v = cell.v as string
          else if (cell.t === 'b') v = cell.v ? 'TRUE' : 'FALSE'
          row[c] = v
          if (v !== null && v !== '') cellCount[c] = (cellCount[c] ?? 0) + 1
          if (cell.f && v !== null) formulaCount[c] = (formulaCount[c] ?? 0) + 1
        }
        matrix.push(row)
      }
    }
    const formulaCols: number[] = []
    cellCount.forEach((n, c) => {
      if (n > 0 && (formulaCount[c] ?? 0) / n >= 0.8) formulaCols.push(c)
    })
    const merges: Merge[] = (ws['!merges'] ?? []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }))
    return { name, matrix, merges, formulaCols }
  })
}

// ---------- dò tiêu đề ----------

const isBlank = (v: Cell) => v === null || (typeof v === 'string' && v.trim() === '')
const nonEmpty = (row: Cell[]) => row.filter((v) => !isBlank(v)).length

export function detectHeader(matrix: Cell[][]): HeaderInfo {
  const top = matrix.slice(0, 40)
  const counts = top.map(nonEmpty)
  const max = Math.max(0, ...counts)
  if (max === 0) return { headerRow: 0, headerRows: 1 }
  const need = Math.max(2, Math.ceil(0.6 * max))
  let h = top.findIndex(
    (row, i) => counts[i] >= need && row.every((v) => isBlank(v) || typeof v === 'string'),
  )
  if (h < 0) h = counts.findIndex((n) => n === max)
  let rows = 1
  while (rows < 3) {
    const next = matrix[h + rows]
    if (!next) break
    const n = nonEmpty(next)
    const allText = next.every((v) => isBlank(v) || (typeof v === 'string' && Number.isNaN(Number(v))))
    if (n >= 1 && n < counts[h] && allText) rows++
    else break
  }
  return { headerRow: h, headerRows: rows }
}

const clean = (v: Cell) => (v === null ? '' : String(v).replace(/\s+/g, ' ').trim())

export function colLetter(i: number): string {
  return XLSX.utils.encode_col(i)
}

/** Nhãn mỗi cột; tiêu đề 2 tầng/ô gộp được ghép bằng " · ". */
export function buildColumns(sheet: SheetData, info: HeaderInfo): Column[] {
  const { matrix, merges, formulaCols } = sheet
  const ncols = Math.max(0, ...matrix.map((r) => r.length))
  const hr = info.headerRow
  const parts: string[][] = Array.from({ length: ncols }, () => [])
  for (let t = 0; t < info.headerRows; t++) {
    const row = matrix[hr + t] ?? []
    const tier: string[] = Array.from({ length: ncols }, (_, c) => clean(row[c] ?? null))
    for (const m of merges) {
      if (m.r1 !== hr + t) continue
      const text = tier[m.c1]
      if (!text) continue
      for (let c = m.c1; c <= m.c2 && c < ncols; c++) tier[c] = text
    }
    tier.forEach((text, c) => {
      if (text && !parts[c].includes(text)) parts[c].push(text)
    })
  }
  const dataRows = matrix.slice(hr + info.headerRows)
  const seen = new Map<string, number>()
  return Array.from({ length: ncols }, (_, c) => {
    let label = parts[c].join(' · ') || `Cột ${colLetter(c)}`
    const k = seen.get(label) ?? 0
    seen.set(label, k + 1)
    if (k > 0) label = `${label} (${k + 1})`
    const values = dataRows.map((r) => r[c] ?? null).filter((v) => !isBlank(v))
    return {
      index: c,
      label,
      empty: values.length === 0,
      formula: formulaCols.includes(c),
      samples: values.slice(0, 3).map(String),
    }
  })
}

// ---------- gợi ý ghép cột ----------

export const normKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const ALIASES: Record<StdField, string[]> = {
  warehouse: ['warehouse', 'ten kho', 'kho'],
  location: ['location', 'vi tri', 'bin', 'ma vi tri'],
  sku: ['sku', 'ma hang', 'ma hang hoa', 'item code', 'item', 'material', 'ma vt'],
  description: ['description', 'ten hang', 'ten hang hoa', 'mo ta', 'item description'],
  category: ['nhom vthh', 'nhom hang', 'nhom hang hoa', 'category', 'product family 1', 'product family'],
  uom_raw: ['pack code', 'dvt', 'don vi tinh', 'uom'],
  qty_system: ['onhand qty', 'on hand qty', 'so luong cuoi ky', 'ton cuoi ky', 'ton kho', 'so luong ton'],
  qty_available: ['available qty'],
  qty_damaged: ['damaged qty'],
  qty_hold: ['hold qty'],
  condition: ['condition', 'tinh trang'],
  batch_no: ['batch no', 'batch', 'so lo', 'lo hang'],
  lot_no: ['lot no', 'lot'],
  manuf_date: ['manuf date', 'manufacture date', 'ngay sx', 'ngay san xuat'],
  receive_date: ['actual receive date', 'receive date', 'ngay nhap', 'ngay nhap kho'],
  expiry_date: ['expiry date', 'han dung', 'hsd', 'expire date'],
}

export function suggestMapping(columns: Column[]): Mapping {
  const out: Mapping = {}
  const used = new Set<number>()
  for (const field of STD_FIELDS) {
    for (const alias of ALIASES[field]) {
      const col = columns.find((c) => !c.empty && !c.formula && !used.has(c.index) && normKey(c.label) === alias)
      if (col) {
        out[field] = col.index
        used.add(col.index)
        break
      }
    }
  }
  return out
}

/** Hồ sơ lưu {trường → nhãn cột}; đổi sang {trường → chỉ số cột} cho file hiện tại. */
export function resolveMapping(saved: Partial<Record<StdField, string>>, columns: Column[]): Mapping | null {
  const out: Mapping = {}
  for (const [field, label] of Object.entries(saved) as [StdField, string][]) {
    const col = columns.find((c) => c.label === label)
    if (!col) return null
    out[field] = col.index
  }
  return out
}

// ---------- chuẩn hoá dòng ----------

export function asText(v: Cell | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  return v.replace(/\s+/g, ' ').trim()
}

export function asNumber(v: Cell | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = v.replace(/\s/g, '')
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : null
}

export function asDate(v: Cell | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToIso(v).slice(0, 10) : String(v)
  const s = v.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  return s
}

const NUM_FIELDS: StdField[] = ['qty_system', 'qty_available', 'qty_damaged', 'qty_hold']
const DATE_FIELDS: StdField[] = ['manuf_date', 'receive_date', 'expiry_date']

export interface ExtractResult {
  rows: StdRow[]
  skippedNoSku: number
  skippedTotal: number
}

export function extractRows(sheet: SheetData, info: HeaderInfo, mapping: Mapping): ExtractResult {
  const rows: StdRow[] = []
  let skippedNoSku = 0
  let skippedTotal = 0
  const start = info.headerRow + info.headerRows
  for (let r = start; r < sheet.matrix.length; r++) {
    const src = sheet.matrix[r]
    if (nonEmpty(src) === 0) continue
    const get = (f: StdField) => (mapping[f] === undefined ? null : (src[mapping[f]!] ?? null))
    const sku = asText(get('sku'))
    const isTotal = src.some((v) => typeof v === 'string' && /^(tổng cộng|tong cong|total|grand total)$/i.test(v.trim()))
    if (isTotal) {
      skippedTotal++
      continue
    }
    if (!sku || sku.startsWith('#')) {
      skippedNoSku++
      continue
    }
    const row = { sku } as StdRow
    for (const f of STD_FIELDS) {
      if (f === 'sku') continue
      if (NUM_FIELDS.includes(f)) (row as Record<string, unknown>)[f] = asNumber(get(f))
      else if (DATE_FIELDS.includes(f)) (row as Record<string, unknown>)[f] = asDate(get(f))
      else (row as Record<string, unknown>)[f] = asText(get(f))
    }
    rows.push(row)
  }
  return { rows, skippedNoSku, skippedTotal }
}

// ---------- bảng tự do (Excel Formatter) ----------

export interface TableData {
  headers: string[]
  rows: Cell[][]
}

/** Toàn bộ bảng, bỏ cột trống và dòng trống. */
export function extractTable(sheet: SheetData, info: HeaderInfo): TableData {
  const columns = buildColumns(sheet, info).filter((c) => !c.empty)
  const start = info.headerRow + info.headerRows
  const rows = sheet.matrix
    .slice(start)
    .map((r) => columns.map((c) => r[c.index] ?? null))
    .filter((r) => r.some((v) => !isBlank(v)))
  return { headers: columns.map((c) => c.label), rows }
}
