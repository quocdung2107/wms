// Gợi ý dòng lấy hàng: cũ trước, lẻ trước. Hàm thuần, không đụng DB.
import { normDate, rowEstimate } from '../../shared/inventory/edit.ts'
import type { EditRow, PickedMap } from '../../shared/inventory/edit.ts'

export interface SuggestItem { row: EditRow; qty: number }
export interface LotWant { batch_no?: string | null; manuf_date?: string | null }
export interface SuggestResult { items: SuggestItem[]; missing: number }

const t = (s: string | null | undefined) => (s ?? '').trim()
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Số lượng có thể lấy của dòng (0 = bỏ). Hold: chỉ phần khả dụng; chỉ hỏng: bỏ; còn lại: tồn ước tính. */
export function availableQty(r: EditRow, picked: PickedMap): number {
  const est = rowEstimate(r, picked)
  if (est <= 0) return 0
  if ((r.qty_hold ?? 0) > 0) return Math.max(0, Math.min(est, r.qty_available ?? est))
  if ((r.qty_damaged ?? 0) > 0 && !((r.qty_available ?? 0) > 0)) return 0
  return est
}

/** Lô tồn khớp yêu cầu Batch/Ngày SX của dòng PK (trường trống = không ràng buộc). */
export function matchesWant(r: EditRow, want?: LotWant): boolean {
  if (!want) return true
  const b = t(want.batch_no)
  if (b && t(r.batch_no).toLowerCase() !== b.toLowerCase()) return false
  const m = normDate(want.manuf_date)
  if (m && (normDate(r.manuf_date) || '') !== m) return false
  return true
}

/**
 * `picked`: đã lấy theo lot_id. `want`: Batch/Ngày SX của dòng PK; có thì chỉ xét lô khớp
 * (hết lô khớp thì báo thiếu, không lấy lô khác).
 */
export function suggestPick(rows: EditRow[], need: number, picked: PickedMap = new Map(), want?: LotWant): SuggestResult {
  const cands = rows
    .filter((row) => matchesWant(row, want))
    .map((row) => {
      const avail = availableQty(row, picked)
      const manuf = normDate(row.manuf_date) || ''
      const expiry = normDate(row.expiry_date) || ''
      const undated = !manuf && !expiry
      return { row, avail, undated, bare: undated && !t(row.batch_no), date: manuf || expiry }
    })
    .filter((c) => c.avail > 0)
  cands.sort((a, b) => {
    if (a.bare !== b.bare) return a.bare ? -1 : 1
    if (a.date !== b.date) return a.date === '' ? 1 : b.date === '' ? -1 : a.date < b.date ? -1 : 1
    if (a.avail !== b.avail) return a.avail - b.avail
    return collator.compare(t(a.row.location), t(b.row.location))
  })
  const items: SuggestItem[] = []
  let left = need
  for (const c of cands) {
    if (left <= 0) break
    const qty = Math.min(c.avail, left)
    items.push({ row: c.row, qty })
    left = Math.round((left - qty) * 1e6) / 1e6
  }
  return { items, missing: Math.max(0, left) }
}
