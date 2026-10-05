// Dựng phiếu kiểm: lọc, gộp, sắp theo vị trí tự nhiên, nhóm theo dãy kệ. Hàm thuần.
import type { StdRow } from '../excel/reader.ts'

export type InvRow = StdRow & { id: number; source_id: number }

export interface SheetOptions {
  merge: boolean
  blind: boolean
  warehouse: string
  category: string
  condition: string
  rack: string
  locationText: string
}

export const DEFAULT_OPTIONS: SheetOptions = {
  merge: true,
  blind: false,
  warehouse: '',
  category: '',
  condition: '',
  rack: '',
  locationText: '',
}

export type Flag = '' | 'neg' | 'zero' | 'frac'

export interface SheetLine {
  key: string
  location: string
  sku: string
  description: string
  uom: string
  qty_system: number | null
  condition: string
  batch_no: string
  manuf_date: string
  receive_date: string
  expiry_date: string
  lots: number
  flag: Flag
}

export interface SheetGroup {
  name: string
  lines: SheetLine[]
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
export const naturalCompare = (a: string, b: string) => collator.compare(a, b)

export const NO_LOCATION = '(Chưa có vị trí)'

/** DS-A01-1 → DS-A: phần trước chữ số đầu tiên. */
export function rackGroup(location: string): string {
  if (!location) return NO_LOCATION
  const g = location.replace(/\d.*$/, '').replace(/[-_\s]+$/, '')
  return g || location
}

export function flagOf(q: number | null): Flag {
  if (q === null) return ''
  if (q < 0) return 'neg'
  if (q === 0) return 'zero'
  return Number.isInteger(q) ? '' : 'frac'
}

export function distinct(rows: InvRow[], pick: (r: InvRow) => string): string[] {
  return [...new Set(rows.map(pick).filter(Boolean))].sort(naturalCompare)
}

const minDate = (a: string, b: string) => (!a ? b : !b ? a : a <= b ? a : b)

export function buildSheet(rows: InvRow[], opts: SheetOptions, uomOf: (raw: string) => string): SheetGroup[] {
  const needle = opts.locationText.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (!opts.warehouse || r.warehouse === opts.warehouse) &&
      (!opts.category || r.category === opts.category) &&
      (!opts.condition || r.condition === opts.condition) &&
      (!opts.rack || rackGroup(r.location) === opts.rack) &&
      (!needle || r.location.toLowerCase().includes(needle)),
  )

  const lines = new Map<string, SheetLine>()
  for (const r of filtered) {
    const key = opts.merge
      ? [r.warehouse, r.location, r.sku, r.batch_no, r.condition].join('\u0001')
      : `id:${r.id}`
    const cur = lines.get(key)
    if (cur) {
      if (r.qty_system !== null) cur.qty_system = (cur.qty_system ?? 0) + r.qty_system
      cur.receive_date = minDate(cur.receive_date, r.receive_date)
      cur.manuf_date ||= r.manuf_date
      cur.expiry_date ||= r.expiry_date
      cur.lots++
    } else {
      lines.set(key, {
        key,
        location: r.location,
        sku: r.sku,
        description: r.description,
        uom: uomOf(r.uom_raw),
        qty_system: r.qty_system,
        condition: r.condition,
        batch_no: r.batch_no,
        manuf_date: r.manuf_date,
        receive_date: r.receive_date,
        expiry_date: r.expiry_date,
        lots: 1,
        flag: '',
      })
    }
  }

  const sorted = [...lines.values()].sort((a, b) => {
    if (!a.location !== !b.location) return a.location ? -1 : 1
    return (
      naturalCompare(a.location, b.location) ||
      naturalCompare(a.sku, b.sku) ||
      naturalCompare(a.batch_no, b.batch_no)
    )
  })

  const groups: SheetGroup[] = []
  for (const line of sorted) {
    line.flag = flagOf(line.qty_system)
    const name = rackGroup(line.location)
    let g = groups[groups.length - 1]
    if (!g || g.name !== name) {
      g = { name, lines: [] }
      groups.push(g)
    }
    g.lines.push(line)
  }
  return groups
}

export const countLines = (groups: SheetGroup[]) => groups.reduce((n, g) => n + g.lines.length, 0)

export const fmtQty = (q: number | null) =>
  q === null ? '' : Number.isInteger(q) ? String(q) : String(Math.round(q * 1000) / 1000)

/** 2026-05-29 → 29/05/2026 (giữ nguyên nếu không đúng dạng ISO). */
export const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export const FLAG_TEXT: Record<Flag, string> = { '': '', neg: 'ÂM', zero: '= 0', frac: 'LẺ' }
