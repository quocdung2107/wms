// Logic thuần của đơn picking (không import client/worker để test được dưới node).
import { weightKey } from '../../shared/inventory/weight.ts'
import { normDate } from '../../shared/inventory/edit.ts'
import { asDate, asNumber, asText, buildColumns, detectHeader, normKey, type Cell, type SheetData } from '../../shared/excel/reader.ts'

export interface PickLine { sku: string; description: string; uom: string; qty_need: number; batch_no?: string; manuf_date?: string }
export interface LineError { row: number; message: string }

/** PK-0001: số thứ tự từ bộ đếm tăng dần (không dùng max+1 nên không tái dùng mã đã xoá). */
export const formatPkCode = (n: number) => `PK-${String(n).padStart(4, '0')}`

/** Mã đơn hàng (DH-xxxx): chuẩn hoá về chữ hoa, bỏ khoảng trắng thừa; rỗng -> null. */
export const normOrderRef = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, '').toUpperCase()
  return t === '' ? null : t
}

/** Khoá dòng PK: (SKU, Batch, Ngày SX); SKU/Batch không phân biệt hoa thường. */
export const lineKey = (l: { sku: string; batch_no?: string | null; manuf_date?: string | null }) =>
  [l.sku.trim().toUpperCase(), (l.batch_no ?? '').trim().toUpperCase(), (l.manuf_date ?? '').trim()].join('')

/** Gộp dòng trùng (SKU, Batch, Ngày SX), cộng dồn số cần; giữ thứ tự xuất hiện đầu tiên. */
export function mergeLines(lines: PickLine[]): PickLine[] {
  const out = new Map<string, PickLine>()
  for (const l of lines) {
    const k = lineKey(l)
    const cur = out.get(k)
    if (cur) {
      cur.qty_need += l.qty_need
      if (!cur.description) cur.description = l.description
      if (!cur.uom) cur.uom = l.uom
    } else out.set(k, { ...l, sku: l.sku.trim() })
  }
  return [...out.values()]
}

const SKU_ALIASES = ['sku', 'ma hang', 'ma hang hoa', 'item code', 'item', 'ma vt', 'material']
const QTY_ALIASES = ['so luong', 'sl', 'qty', 'quantity', 'so luong can', 'sl can', 'can lay']
const DESC_ALIASES = ['ten hang', 'ten hang hoa', 'mo ta', 'description', 'item description']
const UOM_ALIASES = ['dvt', 'don vi tinh', 'uom', 'pack code']
const BATCH_ALIASES = ['batch', 'batch no', 'batchno', 'so lo', 'lo', 'lot', 'lot no']
const MANUF_ALIASES = ['ngay sx', 'ngay san xuat', 'nsx', 'manuf date', 'manufacture date', 'mfg date', 'production date']

export interface ParsedPickSheet { lines: PickLine[]; errors: LineError[]; missing: string[] }

/**
 * Phân tích một sheet có cột SKU + Số lượng (nhận cột theo tên tiêu đề).
 * Dòng SKU trống bị bỏ qua; SL không phải số hoặc <= 0 vào `errors` (không làm hỏng cả file);
 * SKU trùng được cộng dồn. `row` là số dòng 1-based trong file.
 */
export function parsePickSheet(sheet: SheetData): ParsedPickSheet {
  const info = detectHeader(sheet.matrix)
  const cols = buildColumns(sheet, info)
  const find = (aliases: string[]) => cols.find((c) => !c.empty && aliases.includes(normKey(c.label)))?.index
  const iSku = find(SKU_ALIASES)
  const iQty = find(QTY_ALIASES)
  const missing: string[] = []
  if (iSku === undefined) missing.push('SKU')
  if (iQty === undefined) missing.push('Số lượng')
  if (iSku === undefined || iQty === undefined) return { lines: [], errors: [], missing }
  const iDesc = find(DESC_ALIASES)
  const iUom = find(UOM_ALIASES)
  const iBatch = find(BATCH_ALIASES)
  const iManuf = find(MANUF_ALIASES)

  const lines: PickLine[] = []
  const errors: LineError[] = []
  const first = info.headerRow + info.headerRows
  sheet.matrix.slice(first).forEach((r: Cell[], k) => {
    const sku = asText(r[iSku])
    const rawQty = r[iQty]
    const row = first + k + 1
    if (sku === '' && (rawQty === null || rawQty === undefined || rawQty === '')) return
    if (sku === '') return void errors.push({ row, message: 'Thiếu SKU' })
    const qty = asNumber(rawQty)
    if (qty === null) return void errors.push({ row, message: `Số lượng "${asText(rawQty)}" không phải số (SKU ${sku})` })
    if (qty <= 0) return void errors.push({ row, message: `Số lượng phải lớn hơn 0 (SKU ${sku})` })
    let manuf = ''
    if (iManuf !== undefined) {
      const txt = asDate(r[iManuf])
      const n = normDate(txt)
      if (n === null) return void errors.push({ row, message: `Ngày SX "${txt}" không hợp lệ (SKU ${sku})` })
      manuf = n
    }
    lines.push({
      sku, qty_need: qty,
      ...(iBatch === undefined ? {} : { batch_no: asText(r[iBatch]) }),
      ...(iManuf === undefined ? {} : { manuf_date: manuf }),
      description: iDesc === undefined ? '' : asText(r[iDesc]),
      uom: iUom === undefined ? '' : asText(r[iUom]),
    })
  })
  return { lines: mergeLines(lines), errors, missing }
}

/** Tiến độ một dòng: cần / đã lấy / còn thiếu (>= 0) / dư (>= 0) / phần trăm thanh tiến độ (0..100). */
export function lineProgress(need: number, picked: number) {
  const missing = Math.max(0, need - picked)
  const extra = Math.max(0, picked - need)
  const pct = need > 0 ? Math.min(100, Math.round((picked / need) * 100)) : 0
  return { need, picked, missing, extra, pct }
}

/** Số lượng đã lấy theo SKU (khoá chữ hoa) từ các lần lấy của một đơn. */
export function pickedBySku(picks: { sku: string; qty: number }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of picks) {
    const k = p.sku.trim().toUpperCase()
    m.set(k, (m.get(k) ?? 0) + (p.qty ?? 0))
  }
  return m
}

/**
 * Chia số đã lấy (theo SKU, Q6) về từng dòng PK: dòng có Batch/Ngày SX nhận trước, mỗi dòng tối đa số cần;
 * phần dư (lấy quá) dồn vào dòng đầu của SKU. Tổng theo SKU luôn bằng `done`. Kết quả cùng thứ tự `lines`.
 */
export function allocPicked(
  lines: { sku: string; qty_need: number; batch_no?: string | null; manuf_date?: string | null }[],
  done: Map<string, number>,
): number[] {
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6
  const key = (i: number) => lines[i].sku.trim().toUpperCase()
  const spec = (i: number) => ((lines[i].batch_no ?? '').trim() || (lines[i].manuf_date ?? '').trim() ? 1 : 0)
  const rem = new Map(done)
  const out = lines.map(() => 0)
  const order = lines.map((_, i) => i).sort((a, b) => spec(b) - spec(a) || a - b)
  for (const i of order) {
    const r = rem.get(key(i)) ?? 0
    const take = Math.max(0, Math.min(r, lines[i].qty_need))
    out[i] = take
    rem.set(key(i), r6(r - take))
  }
  const seen = new Set<string>()
  lines.forEach((_, j) => {
    const k = key(j)
    if (seen.has(k)) return
    seen.add(k)
    const left = rem.get(k) ?? 0
    if (left > 0) out[j] = r6(out[j] + left)
  })
  return out.map(r6)
}

// ---------- nâng schema ----------

/**
 * Câu lệnh cần chạy cho bảng picks có sẵn trên máy người dùng: chỉ ALTER khi chưa có cột
 * (CREATE TABLE IF NOT EXISTS không thêm cột). `columns` lấy từ PRAGMA table_info(picks).
 */
export function picksUpgradeSql(columns: string[]): string[] {
  const out: string[] = []
  if (!columns.includes('pick_order_id')) out.push('ALTER TABLE picks ADD COLUMN pick_order_id INTEGER')
  out.push('CREATE INDEX IF NOT EXISTS idx_picks_order ON picks(pick_order_id)')
  return out
}

/** Cột bổ sung cho pick_orders có sẵn: chỉ ALTER khi thiếu (columns từ PRAGMA table_info(pick_orders)). */
export function pickOrdersUpgradeSql(columns: string[]): string[] {
  const out: string[] = []
  if (!columns.includes('allow_sku_tag')) out.push('ALTER TABLE pick_orders ADD COLUMN allow_sku_tag INTEGER NOT NULL DEFAULT 0')
  if (!columns.includes('customer_code')) out.push('ALTER TABLE pick_orders ADD COLUMN customer_code TEXT')
  return out
}

// ---------- khối lượng ----------

export interface WeighedLine { sku: string; qty: number; unitKg: number | null; lineKg: number | null }

/**
 * KL từng dòng (= SL x kg/ĐVT) và tổng. SKU không có KL -> unitKg/lineKg = null (không thành 0),
 * không cộng vào tổng, đếm vào `missing`. `weights`: Map weightKey -> kg.
 */
export function weighLines(lines: { sku: string; qty: number }[], weights: Map<string, number>) {
  let totalKg = 0
  let missing = 0
  const rows: WeighedLine[] = lines.map((l) => {
    const kg = weights.get(weightKey(l.sku))
    if (kg === undefined || !(kg > 0)) { missing++; return { sku: l.sku, qty: l.qty, unitKg: null, lineKg: null } }
    const lineKg = l.qty * kg
    totalKg += lineKg
    return { sku: l.sku, qty: l.qty, unitKg: kg, lineKg }
  })
  return { rows, totalKg, missing }
}

/** Làm tròn hiển thị KL (tối đa 3 số lẻ). */
export const fmtKg = (n: number) => String(Math.round(n * 1000) / 1000)

export type AttachPlan = { ok: true; addLine: PickLine | null } | { ok: false; error: string }

/**
 * Quyết định khi gắn một lần lấy vào PK: đã có dòng cùng SKU -> chỉ gắn (không đổi qty_need);
 * chưa có và được phép -> gắn và thêm dòng mới (qty_need = qty của pick); chưa có và tắt -> lỗi.
 */
export function planAttach(
  lines: { sku: string }[],
  pick: { sku: string; description: string; uom: string; qty: number },
  allow: boolean,
): AttachPlan {
  const k = pick.sku.trim().toUpperCase()
  if (lines.some((l) => l.sku.trim().toUpperCase() === k)) return { ok: true, addLine: null }
  if (!allow) return { ok: false, error: 'PK chưa có SKU này và chưa bật cho phép gắn thẻ SKU' }
  return { ok: true, addLine: { sku: pick.sku.trim(), description: pick.description, uom: pick.uom, qty_need: pick.qty } }
}
