// Logic thuần của đơn picking (không import client/worker để test được dưới node).
import { asNumber, asText, buildColumns, detectHeader, normKey, type Cell, type SheetData } from '../../shared/excel/reader.ts'

export interface PickLine { sku: string; description: string; uom: string; qty_need: number }
export interface LineError { row: number; message: string }

/** PK-0001: số thứ tự từ bộ đếm tăng dần (không dùng max+1 nên không tái dùng mã đã xoá). */
export const formatPkCode = (n: number) => `PK-${String(n).padStart(4, '0')}`

/** Mã đơn hàng (DH-xxxx): chuẩn hoá về chữ hoa, bỏ khoảng trắng thừa; rỗng -> null. */
export const normOrderRef = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, '').toUpperCase()
  return t === '' ? null : t
}

/** Gộp dòng trùng SKU (không phân biệt hoa thường), cộng dồn số cần; giữ thứ tự xuất hiện đầu tiên. */
export function mergeLines(lines: PickLine[]): PickLine[] {
  const out = new Map<string, PickLine>()
  for (const l of lines) {
    const k = l.sku.trim().toUpperCase()
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
    lines.push({
      sku, qty_need: qty,
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
