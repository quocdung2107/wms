import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planReceive, type ReceiveLine, type ReceivePlan } from '../src/shared/inventory/receive.ts'
import { rowEstimate, type EditRow, type EditOp, type PickedMap } from '../src/shared/inventory/edit.ts'

let nid = 1
const row = (o: Partial<EditRow> = {}): EditRow => ({
  id: nid++, source_id: 1, source: 'A', warehouse: 'W', location: 'L1', sku: 'S1', description: 'mo ta', category: 'c', uom_raw: 'PCS',
  qty_system: 100, qty_available: null, qty_damaged: null, qty_hold: null, condition: 'OK', batch_no: 'B1', lot_no: '',
  manuf_date: '2026-01-01', receive_date: '', expiry_date: '', ...o,
})
const line = (o: Partial<ReceiveLine> = {}): ReceiveLine => ({ sku: 'S1', qty: 10, location: 'L1', batch_no: 'B1', manuf_date: '2026-01-01', ...o })
const src = { id: 1, name: 'A' }
const pk = (sku: string, ...e: [number, number][]) => new Map<string, PickedMap>([[sku.toUpperCase(), new Map(e)]]) // lot_id -> đã lấy
const okPlan = (p: ReceivePlan) => { assert.ok(p.ok, p.ok ? '' : p.error); return p as Extract<ReceivePlan, { ok: true }> }
const errOf = (p: ReceivePlan) => { assert.equal(p.ok, false); return (p as { error: string }).error }

function apply(rows: EditRow[], ops: EditOp[]): EditRow[] {
  const out = rows.map((r) => ({ ...r }))
  for (const o of ops) {
    if (o.op === 'update') Object.assign(out.find((r) => r.id === o.id)!, o.set)
    else if (o.op === 'insert') out.push({ ...o.row, id: nid++, source_id: o.source_id, source: 'A', lot_id: 9000 + nid })
  }
  return out
}

test('AC-1 dòng trùng thì cộng qty_system, khác khoá thì insert', () => {
  const r = row()
  const plan = okPlan(planReceive(src, [line(), line({ location: 'L2', qty: 5 })], [r], new Map()))
  assert.equal(plan.ops.length, 2)
  const after = apply([r], plan.ops)
  assert.equal(after[0].qty_system, 110)
  assert.equal(after.length, 2)
  assert.equal(after[1].location, 'L2')
  assert.equal(after[1].qty_system, 5)
  assert.equal(plan.logs.length, 1)
  assert.equal(plan.logs[0].kind, 'receive')
})

test('AC-1 các dòng trùng trong phiếu được cộng gộp (SKU không phân biệt hoa/thường)', () => {
  const plan = okPlan(planReceive(src, [line({ qty: 3 }), line({ sku: 's1', qty: 4 })], [row()], new Map()))
  assert.equal(plan.ops.length, 1)
  const o = plan.ops[0]
  assert.ok(o.op === 'update' && o.set.qty_system === 107)
})

test('AC-1 SKU mới: các dòng trùng gộp thành một insert', () => {
  const l = { sku: 'N1', location: 'L5', batch_no: '', manuf_date: '', description: 'moi', uom_raw: 'BOX' }
  const plan = okPlan(planReceive(src, [{ ...l, qty: 2 }, { ...l, qty: 3, description: '' }], [], new Map(), '2026-10-15'))
  assert.equal(plan.ops.length, 1)
  const o = plan.ops[0]
  assert.ok(o.op === 'insert')
  assert.equal(o.row.qty_system, 5)
  assert.equal(o.row.description, 'moi')
  assert.equal(o.row.receive_date, '2026-10-15')
})

test('AC-2 validation', () => {
  const ex = [row()]
  assert.match(errOf(planReceive(src, [], ex, new Map())), /trống/)
  for (const qty of [0, -1, NaN, Infinity]) assert.match(errOf(planReceive(src, [line({ qty })], ex, new Map())), /lớn hơn 0/)
  assert.match(errOf(planReceive(src, [line({ sku: '  ' })], ex, new Map())), /SKU/)
  assert.match(errOf(planReceive(src, [line({ manuf_date: 'abc' })], ex, new Map())), /Ngày SX/)
  assert.match(errOf(planReceive(src, [line({ expiry_date: '31/02/2026' })], ex, new Map())), /Hạn dùng/)
  assert.match(errOf(planReceive(src, [line({ sku: 'NEW', uom_raw: 'PCS' })], ex, new Map())), /mô tả/)
  assert.match(errOf(planReceive(src, [line({ sku: 'NEW', description: 'x' })], ex, new Map())), /ĐVT/)
})

test('AC-2 SKU đã có lấy mô tả/ĐVT/kho từ dòng sẵn có', () => {
  const plan = okPlan(planReceive(src, [line({ location: 'L9', description: 'khac', uom_raw: 'BOX' })], [row()], new Map()))
  const o = plan.ops[0]
  assert.ok(o.op === 'insert')
  assert.equal(o.row.description, 'mo ta')
  assert.equal(o.row.uom_raw, 'PCS')
  assert.equal(o.row.warehouse, 'W')
})

test('AC-3 tồn ước tính tăng đúng bằng SL nhập khi đã có picked', () => {
  const r = row({ lot_id: 1 })
  const p = pk('S1', [1, 30], [2, 7])
  const m = p.get('S1')!
  const before = rowEstimate(r, m)
  const plan = okPlan(planReceive(src, [line({ qty: 10 }), line({ location: 'L2', qty: 4 })], [r], p))
  const after = apply([r], plan.ops)
  assert.equal(rowEstimate(after[0], m), before + 10)
  assert.equal(after[0].qty_system, 110)
  assert.equal(rowEstimate(after[1], m), 4)
  assert.equal(after[1].qty_system, 4) // lô mới chưa có picks
})

test('AC-4 lot_id: khớp thì giữ lot_id lô có sẵn; không khớp thì lot mới; hai lô trùng giữ riêng', () => {
  const r = row({ lot_id: 5 })
  const out = apply([r], okPlan(planReceive(src, [line(), line({ location: 'L2', qty: 5 })], [r], new Map())).ops)
  assert.equal(out[0].lot_id, 5)
  assert.equal(out[0].qty_system, 110)
  assert.ok(out[1].lot_id != null && out[1].lot_id !== 5)
  const a = row({ lot_id: 1 }); const b = row({ lot_id: 2 })
  const out2 = apply([a, b], okPlan(planReceive(src, [line()], [a, b], new Map())).ops)
  assert.deepEqual(out2.map((x) => x.lot_id), [1, 2])
  assert.equal(out2.length, 2)
})
