// Nhập hàng tay: hàm thuần planReceive. Dòng trùng (nguồn+SKU+Location+BatchNo+Ngày SX) -> cộng qty_system;
// không trùng -> insert. Các dòng trùng nhau trong phiếu được cộng gộp trước. Tồn ước tính tăng đúng bằng SL nhập.
import type { StdRow } from '../excel/reader.ts'
import { normDate, r6, t, rowEstimate } from './edit.ts'
import type { EditLog, EditOp, EditRow, PickedMap, RowSnap } from './edit.ts'
import { locKey, skuKey } from './history.ts'

export interface ReceiveLine {
  sku: string
  qty: number
  location: string
  batch_no: string
  manuf_date: string
  receive_date?: string
  expiry_date?: string
  description?: string // bắt buộc khi SKU mới
  uom_raw?: string // bắt buộc khi SKU mới
}

export type ReceivePlan = { ok: true; ops: EditOp[]; logs: EditLog[] } | { ok: false; error: string }

interface Group {
  qty: number
  sku: string
  location: string
  batch: string
  manuf: string
  recv: string
  exp: string
  description: string
  uom: string
}

/**
 * @param source nguồn nhận hàng (id + tên khớp picks.source)
 * @param lines các dòng phiếu
 * @param existing tồn hiện có (lọc theo source.id)
 * @param picked đã lấy theo locKey, tách theo skuKey (chữ hoa)
 * @param today YYYY-MM-DD, mặc định Ngày nhập khi bỏ trống
 */
export function planReceive(
  source: { id: number; name: string },
  lines: ReceiveLine[],
  existing: EditRow[],
  picked: Map<string, PickedMap>,
  today = '',
): ReceivePlan {
  const fail = (error: string): ReceivePlan => ({ ok: false, error })
  if (lines.length === 0) return fail('Phiếu nhập trống')
  const todayN = normDate(today) ?? ''
  const groups = new Map<string, Group>()
  for (const [i, l] of lines.entries()) {
    const n = `Dòng ${i + 1}`
    const sku = t(l.sku)
    if (!sku) return fail(`${n}: chưa nhập SKU`)
    if (!Number.isFinite(l.qty) || !(l.qty > 0)) return fail(`${n}: số lượng phải lớn hơn 0`)
    const manuf = normDate(l.manuf_date)
    if (manuf === null) return fail(`${n}: Ngày SX không hợp lệ (dùng YYYY-MM-DD hoặc DD/MM/YYYY)`)
    const recv = normDate(l.receive_date)
    if (recv === null) return fail(`${n}: Ngày nhập không hợp lệ`)
    const exp = normDate(l.expiry_date)
    if (exp === null) return fail(`${n}: Hạn dùng không hợp lệ`)
    const location = t(l.location)
    const batch = t(l.batch_no)
    const k = [skuKey(sku), location, batch, manuf].join('\u0001')
    const g = groups.get(k)
    if (g) {
      g.qty = r6(g.qty + l.qty)
      g.recv ||= recv
      g.exp ||= exp
      g.description ||= t(l.description)
      g.uom ||= t(l.uom_raw)
    } else {
      groups.set(k, {
        qty: l.qty, sku, location, batch, manuf, recv: recv || todayN, exp,
        description: t(l.description), uom: t(l.uom_raw),
      })
    }
  }

  const bySku = new Map<string, EditRow[]>()
  for (const r of existing) {
    if (r.source_id !== source.id) continue
    const k = skuKey(r.sku)
    bySku.set(k, [...(bySku.get(k) ?? []), r])
  }
  // SKU mới cần mô tả + ĐVT (lấy từ bất kỳ dòng nào của SKU đó trong phiếu)
  const newInfo = new Map<string, { sku: string; description: string; uom: string }>()
  for (const g of groups.values()) {
    const k = skuKey(g.sku)
    if (bySku.has(k)) continue
    const cur = newInfo.get(k) ?? { sku: g.sku, description: '', uom: '' }
    cur.description ||= g.description
    cur.uom ||= g.uom
    newInfo.set(k, cur)
  }
  for (const v of newInfo.values()) {
    if (!v.description) return fail(`SKU mới ${v.sku}: thiếu mô tả`)
    if (!v.uom) return fail(`SKU mới ${v.sku}: thiếu ĐVT`)
  }

  const ops: EditOp[] = []
  const logMap = new Map<string, EditLog>()
  const pickedAt = (k: string, location: string, batch: string) => picked.get(k)?.get(locKey(source.name, location, batch)) ?? 0
  const snap = (r: EditRow, qty: number): RowSnap => ({ id: r.id, lot_id: r.lot_id ?? null, location: t(r.location), batch_no: t(r.batch_no), manuf_date: t(r.manuf_date), qty })

  for (const g of groups.values()) {
    const k = skuKey(g.sku)
    const rows = bySku.get(k) ?? []
    const base = rows[0]
    let log = logMap.get(k)
    if (!log) logMap.set(k, (log = { kind: 'receive', sku: base?.sku ?? g.sku, source: source.name, before: [], after: [] }))
    const hit = rows.find((r) => t(r.location) === g.location && t(r.batch_no) === g.batch && t(r.manuf_date) === g.manuf)
    if (hit) {
      const est = rowEstimate(hit, picked.get(k) ?? new Map())
      const newEst = r6(est + g.qty)
      ops.push({ op: 'update', id: hit.id, set: { qty_system: r6(newEst + pickedAt(k, hit.location, hit.batch_no)) } })
      log.before.push(snap(hit, est))
      log.after.push(snap(hit, newEst))
    } else {
      const info = base ? { description: base.description, uom: base.uom_raw } : newInfo.get(k)!
      const row: StdRow = {
        warehouse: base?.warehouse ?? '', location: g.location, sku: base?.sku ?? g.sku, description: info.description,
        category: base?.category ?? '', uom_raw: info.uom, qty_system: r6(g.qty + pickedAt(k, g.location, g.batch)),
        qty_available: null, qty_damaged: null, qty_hold: null, condition: '', batch_no: g.batch, lot_no: '',
        manuf_date: g.manuf, receive_date: g.recv, expiry_date: g.exp,
      }
      ops.push({ op: 'insert', source_id: source.id, row })
      log.after.push({ location: g.location, batch_no: g.batch, manuf_date: g.manuf, qty: g.qty })
    }
  }
  return { ok: true, ops, logs: [...logMap.values()] }
}
