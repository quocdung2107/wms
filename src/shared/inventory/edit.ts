// Sửa / di chuyển / tách / gộp dòng tồn. Hàm thuần: nhận dòng + "đã lấy" (theo locKey, của đúng SKU),
// trả danh sách thao tác SQL (EditOp) + bản ghi nhật ký, hoặc lỗi. repo.ts mới ghi vào DB.
//
// Lô (lot_id): sửa/di chuyển một phần/tách phần 1 giữ lot_id; dòng insert được repo cấp lot_id mới từ lot_counter;
// gộp chuyển picks.lot_id của dòng bị xoá sang dòng đầu.
//
// Giữ tồn ước tính: ước tính = qty_system - picked(locKey). Picks cũ giữ nguyên khoá cũ, nên khi dòng
// sang khoá mới ta đặt qty_system mới = ước tính cần giữ + picked(khoá mới) -> ước tính không đổi.
import type { StdRow } from '../excel/reader.ts'
import { locKey, skuKey } from './history.ts'
import type { InvRow } from './sheet.ts'

export type EditRow = InvRow & { source: string; lot_id?: number | null } // source = tên nguồn (khớp picks.source)
export type PickedMap = Map<string, number> // locKey -> đã lấy (của một SKU)

export type EditOp =
  | { op: 'update'; id: number; set: Partial<StdRow> }
  | { op: 'insert'; source_id: number; row: StdRow }
  | { op: 'delete'; id: number }
  | { op: 'repoint_picks'; from: number; to: number } // gộp: picks.lot_id của lô bị xoá -> lô giữ lại

export type EditKind = 'edit' | 'move' | 'split' | 'merge' | 'receive'

export interface RowSnap { id?: number; lot_id?: number | null; location: string; batch_no: string; manuf_date: string; qty: number }

export interface EditLog { kind: EditKind; sku: string; source: string; before: RowSnap[]; after: RowSnap[] }

export type EditPlan = { ok: true; ops: EditOp[]; log: EditLog } | { ok: false; error: string }

export interface PartInput { location: string; batch_no: string; manuf_date: string; qty: number }

const fail = (error: string): EditPlan => ({ ok: false, error })
export const r6 = (n: number) => Math.round(n * 1e6) / 1e6
export const t = (s: string | null | undefined) => (s ?? '').trim()

const pickedOf = (picked: PickedMap, r: { source: string }, location: string, batch: string) =>
  picked.get(locKey(r.source, location, batch)) ?? 0

/** Tồn ước tính của dòng = qty_system - đã lấy theo khoá hiện tại. */
export function rowEstimate(r: EditRow, picked: PickedMap): number {
  return r.qty_system === null || r.qty_system === undefined
    ? 0 - pickedOf(picked, r, r.location, r.batch_no)
    : r6(r.qty_system - pickedOf(picked, r, r.location, r.batch_no))
}

/** Chuẩn hoá ngày về YYYY-MM-DD (nhận YYYY-MM-DD hoặc DD/MM/YYYY); rỗng -> ''; sai -> null. */
export function normDate(s: string | null | undefined): string | null {
  const v = t(s)
  if (!v) return ''
  const pad = (n: string) => n.padStart(2, '0')
  let y: string, m: string, d: string
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(v)
  if (x) [, y, m, d] = x
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) [, d, m, y] = x
  else return null
  const dt = new Date(Date.UTC(+y, +m - 1, +d))
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const snap = (r: EditRow, picked: PickedMap): RowSnap => ({
  id: r.id, lot_id: r.lot_id ?? null, location: t(r.location), batch_no: t(r.batch_no), manuf_date: t(r.manuf_date), qty: rowEstimate(r, picked),
})

/** Dòng mới sao chép thông tin SKU/ĐVT/nguồn từ dòng gốc; số lượng phụ (khả dụng/hỏng/hold) để trống. */
function cloneRow(r: EditRow, p: { location: string; batch_no: string; manuf_date: string; qty_system: number }): StdRow {
  return {
    warehouse: r.warehouse, location: p.location, sku: r.sku, description: r.description, category: r.category,
    uom_raw: r.uom_raw, qty_system: p.qty_system, qty_available: null, qty_damaged: null, qty_hold: null,
    condition: r.condition, batch_no: p.batch_no, lot_no: r.lot_no, manuf_date: p.manuf_date,
    receive_date: r.receive_date, expiry_date: r.expiry_date,
  }
}

const sameLot = (a: EditRow, location: string, batch: string, manuf: string) =>
  t(a.location) === location && t(a.batch_no) === batch && t(a.manuf_date) === manuf

/** Sửa Location / BatchNo / Ngày SX của một dòng; tồn ước tính không đổi. */
export function planEdit(
  row: EditRow,
  patch: { location: string; batch_no: string; manuf_date: string },
  picked: PickedMap,
): EditPlan {
  const location = t(patch.location)
  const batch = t(patch.batch_no)
  const manuf = normDate(patch.manuf_date)
  if (manuf === null) return fail('Ngày SX không hợp lệ (dùng YYYY-MM-DD hoặc DD/MM/YYYY)')
  const est = rowEstimate(row, picked)
  const set: Partial<StdRow> = { location, batch_no: batch, manuf_date: manuf }
  if (row.qty_system !== null && row.qty_system !== undefined) set.qty_system = r6(est + pickedOf(picked, row, location, batch))
  const after: RowSnap = { id: row.id, lot_id: row.lot_id ?? null, location, batch_no: batch, manuf_date: manuf, qty: est }
  return { ok: true, ops: [{ op: 'update', id: row.id, set }], log: { kind: 'edit', sku: row.sku, source: row.source, before: [snap(row, picked)], after: [after] } }
}

/**
 * Di chuyển m (0 < m <= tồn ước tính) sang Location đích. `all` = các dòng của cùng SKU (để tìm dòng đích
 * trùng nguồn/Location/Batch/Ngày SX).
 */
export function planMove(row: EditRow, qty: number, toLocation: string, all: EditRow[], picked: PickedMap): EditPlan {
  const to = t(toLocation)
  const est = rowEstimate(row, picked)
  if (!Number.isFinite(qty) || !(qty > 0)) return fail('Số lượng di chuyển phải lớn hơn 0')
  if (r6(qty) > est) return fail(`Số lượng di chuyển (${qty}) vượt tồn ước tính (${est})`)
  if (!to) return fail('Chưa nhập Location đích')
  if (to === t(row.location)) return fail('Location đích trùng Location nguồn')
  const batch = t(row.batch_no)
  const manuf = t(row.manuf_date)
  const target = all.find((a) => a.id !== row.id && a.source_id === row.source_id && skuKey(a.sku) === skuKey(row.sku) && sameLot(a, to, batch, manuf))
  const left = r6(est - qty)
  const ops: EditOp[] = []
  const before = [snap(row, picked)]
  const after: RowSnap[] = []
  if (left === 0) ops.push({ op: 'delete', id: row.id })
  else {
    ops.push({ op: 'update', id: row.id, set: { qty_system: r6(left + pickedOf(picked, row, row.location, row.batch_no)) } })
    after.push({ ...snap(row, picked), qty: left })
  }
  if (target) {
    before.push(snap(target, picked))
    const tq = r6(rowEstimate(target, picked) + qty)
    ops.push({ op: 'update', id: target.id, set: { qty_system: r6(tq + pickedOf(picked, target, target.location, target.batch_no)) } })
    after.push({ ...snap(target, picked), qty: tq })
  } else {
    ops.push({ op: 'insert', source_id: row.source_id, row: cloneRow(row, { location: to, batch_no: batch, manuf_date: manuf, qty_system: r6(qty + pickedOf(picked, row, to, batch)) }) })
    after.push({ location: to, batch_no: batch, manuf_date: manuf, qty })
  }
  return { ok: true, ops, log: { kind: 'move', sku: row.sku, source: row.source, before, after } }
}

/** Tách một dòng thành >= 2 phần; tổng phần = tồn ước tính, mỗi phần > 0. */
export function planSplit(row: EditRow, parts: PartInput[], picked: PickedMap): EditPlan {
  if (parts.length < 2) return fail('Cần ít nhất 2 phần để tách')
  const est = rowEstimate(row, picked)
  const norm: PartInput[] = []
  const seen = new Set<string>()
  for (const [i, p] of parts.entries()) {
    const manuf = normDate(p.manuf_date)
    if (manuf === null) return fail(`Phần ${i + 1}: Ngày SX không hợp lệ`)
    if (!Number.isFinite(p.qty) || !(p.qty > 0)) return fail(`Phần ${i + 1}: số lượng phải lớn hơn 0`)
    const n = { location: t(p.location), batch_no: t(p.batch_no), manuf_date: manuf, qty: p.qty }
    const k = [n.location, n.batch_no, n.manuf_date].join('\u0001')
    if (seen.has(k)) return fail(`Phần ${i + 1} trùng Location/Batch/Ngày SX với phần khác`)
    seen.add(k)
    norm.push(n)
  }
  const sum = r6(norm.reduce((s, p) => s + p.qty, 0))
  if (sum !== est) return fail(`Tổng các phần (${sum}) khác tồn ước tính (${est})`)
  const ops: EditOp[] = []
  norm.forEach((p, i) => {
    const qs = r6(p.qty + pickedOf(picked, row, p.location, p.batch_no))
    if (i === 0) ops.push({ op: 'update', id: row.id, set: { location: p.location, batch_no: p.batch_no, manuf_date: p.manuf_date, qty_system: qs } })
    else ops.push({ op: 'insert', source_id: row.source_id, row: cloneRow(row, { ...p, qty_system: qs }) })
  })
  const after = norm.map((p, i): RowSnap => ({ ...(i === 0 ? { id: row.id, lot_id: row.lot_id ?? null } : {}), location: p.location, batch_no: p.batch_no, manuf_date: p.manuf_date, qty: p.qty }))
  return { ok: true, ops, log: { kind: 'split', sku: row.sku, source: row.source, before: [snap(row, picked)], after } }
}

/** Gộp >= 2 dòng cùng nguồn/SKU/Ngày SX/BatchNo về một dòng ở `location`. */
export function planMerge(rows: EditRow[], location: string, picked: PickedMap): EditPlan {
  if (rows.length < 2) return fail('Cần chọn ít nhất 2 dòng để gộp')
  if (new Set(rows.map((r) => r.id)).size !== rows.length) return fail('Có dòng bị chọn trùng')
  const loc = t(location)
  if (!loc) return fail('Chưa nhập Location kết quả')
  const [first] = rows
  for (const r of rows) {
    if (r.source_id !== first.source_id) return fail('Không gộp được: khác nguồn')
    if (skuKey(r.sku) !== skuKey(first.sku)) return fail('Không gộp được: khác SKU')
    if (t(r.manuf_date) !== t(first.manuf_date)) return fail('Không gộp được: khác Ngày SX')
    if (t(r.batch_no) !== t(first.batch_no)) return fail('Không gộp được: khác BatchNo')
  }
  const batch = t(first.batch_no)
  const total = r6(rows.reduce((s, r) => s + rowEstimate(r, picked), 0))
  const sumOf = (f: 'qty_available' | 'qty_damaged' | 'qty_hold') =>
    rows.some((r) => r[f] !== null && r[f] !== undefined) ? r6(rows.reduce((s, r) => s + (r[f] ?? 0), 0)) : null
  const ops: EditOp[] = [
    {
      op: 'update', id: first.id,
      set: {
        location: loc, qty_system: r6(total + pickedOf(picked, first, loc, batch)),
        qty_available: sumOf('qty_available'), qty_damaged: sumOf('qty_damaged'), qty_hold: sumOf('qty_hold'),
      },
    },
    ...rows.slice(1).flatMap((r): EditOp[] => [
      ...(r.lot_id != null && first.lot_id != null && r.lot_id !== first.lot_id ? [{ op: 'repoint_picks' as const, from: r.lot_id, to: first.lot_id }] : []),
      { op: 'delete', id: r.id },
    ]),
  ]
  const after: RowSnap = { id: first.id, lot_id: first.lot_id ?? null, location: loc, batch_no: batch, manuf_date: t(first.manuf_date), qty: total }
  return { ok: true, ops, log: { kind: 'merge', sku: first.sku, source: first.source, before: rows.map((r) => snap(r, picked)), after: [after] } }
}
