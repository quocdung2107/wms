// CRUD đơn picking trên SQLite cục bộ (offline, không cần đăng nhập).
import { batch, query } from '../../shared/db/client.ts'
import { nowLocal, type Pick } from '../../shared/inventory/history.ts'
import { initSchema } from '../../shared/inventory/repo.ts'
import { mergeLines, normOrderRef, type PickLine } from './logic.ts'

export interface PickOrder {
  id: number
  code: string
  name: string
  status: string
  order_ref: string | null
  created_at: string
}
export interface PickOrderLine extends PickLine { id: number }

const str = (v: unknown) => (v == null ? '' : String(v))
const toOrder = (r: Record<string, unknown>): PickOrder => ({
  id: r.id as number, code: str(r.code), name: str(r.name), status: str(r.status) || 'open',
  order_ref: r.order_ref == null ? null : String(r.order_ref), created_at: str(r.created_at),
})

export async function listPickOrders(): Promise<PickOrder[]> {
  await initSchema()
  return (await query('SELECT * FROM pick_orders ORDER BY id DESC')).map(toOrder)
}

export async function getPickOrder(id: number): Promise<PickOrder | null> {
  await initSchema()
  const [r] = await query('SELECT * FROM pick_orders WHERE id = ?', [id])
  return r ? toOrder(r) : null
}

/** Tạo đơn mới; mã PK lấy từ bộ đếm tăng dần trong cùng một giao dịch. */
export async function createPickOrder(input: { name: string; order_ref?: string | null }): Promise<number> {
  await initSchema()
  await batch([
    { sql: 'UPDATE pick_counter SET n = n + 1 WHERE id = 1' },
    {
      sql: `INSERT INTO pick_orders (code, name, status, order_ref, created_at)
            SELECT 'PK-' || printf('%04d', n), ?, 'open', ?, ? FROM pick_counter WHERE id = 1`,
      bind: [input.name.trim(), normOrderRef(input.order_ref), nowLocal()],
    },
  ])
  const [{ id }] = await query('SELECT last_insert_rowid() AS id')
  return id as number
}

/** Gắn/đổi mã đơn hàng DH-xxxx (rỗng = bỏ gắn). */
export async function setOrderRef(id: number, ref: string): Promise<void> {
  await initSchema()
  await query('UPDATE pick_orders SET order_ref = ? WHERE id = ?', [normOrderRef(ref), id])
}

export async function renamePickOrder(id: number, name: string): Promise<void> {
  await initSchema()
  await query('UPDATE pick_orders SET name = ? WHERE id = ?', [name.trim(), id])
}

/** Xoá đơn và dòng cần lấy; các lần lấy đã ghi vẫn giữ ở Lịch sử (tách khỏi đơn). */
export async function deletePickOrder(id: number): Promise<void> {
  await initSchema()
  await batch([
    { sql: 'UPDATE picks SET pick_order_id = NULL WHERE pick_order_id = ?', bind: [id] },
    { sql: 'DELETE FROM pick_order_lines WHERE pick_order_id = ?', bind: [id] },
    { sql: 'DELETE FROM pick_orders WHERE id = ?', bind: [id] },
  ])
}

export async function listLines(orderId: number): Promise<PickOrderLine[]> {
  await initSchema()
  return (await query('SELECT * FROM pick_order_lines WHERE pick_order_id = ? ORDER BY id', [orderId])).map((r) => ({
    id: r.id as number, sku: str(r.sku), description: str(r.description), uom: str(r.uom), qty_need: (r.qty_need as number) ?? 0,
  }))
}

/** Thêm dòng; SKU đã có trong đơn thì cộng dồn số cần. */
export async function addLines(orderId: number, lines: PickLine[]): Promise<void> {
  await initSchema()
  const existing = await listLines(orderId)
  const byKey = new Map(existing.map((l) => [l.sku.toUpperCase(), l]))
  const stmts = []
  for (const l of mergeLines(lines)) {
    const cur = byKey.get(l.sku.toUpperCase())
    if (cur) stmts.push({ sql: 'UPDATE pick_order_lines SET qty_need = qty_need + ? WHERE id = ?', bind: [l.qty_need, cur.id] })
    else stmts.push({ sql: 'INSERT INTO pick_order_lines (pick_order_id, sku, description, uom, qty_need) VALUES (?,?,?,?,?)', bind: [orderId, l.sku, l.description, l.uom, l.qty_need] })
  }
  if (stmts.length) await batch(stmts)
}

export async function setLineNeed(lineId: number, qty: number): Promise<void> {
  if (!(qty > 0)) throw new Error('Số lượng phải lớn hơn 0')
  await query('UPDATE pick_order_lines SET qty_need = ? WHERE id = ?', [qty, lineId])
}

export async function deleteLine(lineId: number): Promise<void> {
  await query('DELETE FROM pick_order_lines WHERE id = ?', [lineId])
}

export async function listOrderPicks(orderId: number): Promise<Pick[]> {
  await initSchema()
  return (await query('SELECT * FROM picks WHERE pick_order_id = ? ORDER BY picked_at DESC, id DESC', [orderId])).map((r) => ({
    id: r.id as number, sku: str(r.sku), description: str(r.description), source: str(r.source),
    location: str(r.location), batch_no: str(r.batch_no), uom: str(r.uom), qty: (r.qty as number) ?? 0,
    order_no: r.order_no == null ? null : String(r.order_no), picked_at: str(r.picked_at), note: str(r.note),
    pick_order_id: orderId,
  }))
}
