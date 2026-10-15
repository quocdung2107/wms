import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planEdit, planMove, planSplit, planMerge, rowEstimate, normDate, type EditRow, type EditOp, type EditPlan, type PickedMap } from '../src/shared/inventory/edit.ts'

let nid = 1
const row = (o: Partial<EditRow> = {}): EditRow => ({
  id: nid, lot_id: nid++, source_id: 1, source: 'A', warehouse: 'W', location: 'L1', sku: 'S1', description: 'd', category: 'c', uom_raw: 'PCS',
  qty_system: 100, qty_available: null, qty_damaged: null, qty_hold: null, condition: 'OK', batch_no: 'B1', lot_no: '',
  manuf_date: '2026-01-01', receive_date: '', expiry_date: '', ...o,
})
const pk = (...e: [number, number][]): PickedMap => new Map(e) // lot_id -> đã lấy

/** Mô phỏng áp ops lên danh sách dòng. */
function apply(rows: EditRow[], ops: EditOp[]): EditRow[] {
  let out = rows.map((r) => ({ ...r }))
  for (const o of ops) {
    if (o.op === 'delete') out = out.filter((r) => r.id !== o.id)
    else if (o.op === 'update') Object.assign(out.find((r) => r.id === o.id)!, o.set)
    else if (o.op === 'insert') out.push({ ...o.row, id: nid++, source_id: o.source_id, source: 'A', lot_id: 9000 + nid })
  }
  return out
}
const total = (rows: EditRow[], p: PickedMap) => rows.reduce((s, r) => s + rowEstimate(r, p), 0)
const okPlan = (p: EditPlan) => { assert.ok(p.ok, p.ok ? '' : p.error); return p as Extract<EditPlan, { ok: true }> }

test('normDate', () => {
  assert.equal(normDate('05/03/2026'), '2026-03-05')
  assert.equal(normDate('2026-3-5'), '2026-03-05')
  assert.equal(normDate(''), '')
  assert.equal(normDate('31/02/2026'), null)
  assert.equal(normDate('abc'), null)
})

test('AC-1 sửa: ước tính không đổi, qty_system không đổi vì picks đi theo lot_id', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 30])
  const plan = okPlan(planEdit(r, { location: 'L9', batch_no: 'B9', manuf_date: '02/02/2026' }, p))
  const after = apply([r], plan.ops)
  assert.equal(after[0].location, 'L9')
  assert.equal(after[0].manuf_date, '2026-02-02')
  assert.equal(after[0].qty_system, 100)
  assert.equal(rowEstimate(after[0], p), 70)
  assert.equal(plan.log.kind, 'edit')
})

test('AC-1 sửa: chỉ đổi ngày SX giữ nguyên khoá -> qty_system giữ; ngày sai bị từ chối', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 30])
  const plan = okPlan(planEdit(r, { location: 'L1', batch_no: 'B1', manuf_date: '2026-05-05' }, p))
  assert.equal(apply([r], plan.ops)[0].qty_system, 100)
  assert.equal(planEdit(r, { location: 'L1', batch_no: 'B1', manuf_date: 'xx' }, p).ok, false)
})

test('AC-1 sửa sang vị trí trùng lô khác có picks: ước tính vẫn giữ, không dính picks lô kia', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 30], [2, 5])
  const after = apply([r], okPlan(planEdit(r, { location: 'L2', batch_no: 'B1', manuf_date: '' }, p)).ops)
  assert.equal(rowEstimate(after[0], p), 70)
})

test('AC-2 di chuyển một phần sang Location mới: tạo dòng, tổng không đổi', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 20])
  const plan = okPlan(planMove(r, 30, 'L2', [r], p))
  const after = apply([r], plan.ops)
  assert.equal(after.length, 2)
  assert.equal(rowEstimate(after[0], p), 50)
  const n = after[1]
  assert.equal(n.location, 'L2'); assert.equal(n.sku, 'S1'); assert.equal(n.uom_raw, 'PCS'); assert.equal(n.batch_no, 'B1')
  assert.equal(rowEstimate(n, p), 30)
  assert.equal(total(after, p), total([r], p))
})

test('AC-2 di chuyển vào dòng đã có (cùng nguồn/SKU/Location/Batch/Ngày SX): cộng dồn', () => {
  const a = row(); const b = row({ location: 'L2', qty_system: 10 }); const p = pk()
  const after = apply([a, b], okPlan(planMove(a, 40, 'L2', [a, b], p)).ops)
  assert.equal(after.length, 2)
  assert.equal(rowEstimate(after[0], p), 60)
  assert.equal(rowEstimate(after[1], p), 50)
})

test('AC-2 khác Ngày SX hoặc khác nguồn thì không cộng vào dòng đó', () => {
  const a = row(); const b = row({ location: 'L2', manuf_date: '2025-01-01' }); const c = row({ location: 'L2', source_id: 2 })
  const after = apply([a, b, c], okPlan(planMove(a, 10, 'L2', [a, b, c], pk())).ops)
  assert.equal(after.length, 4)
})

test('AC-2 di chuyển hết: xoá dòng nguồn; vượt tồn / <=0 / cùng Location bị từ chối', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 20])
  const after = apply([r], okPlan(planMove(r, 80, 'L2', [r], p)).ops)
  assert.equal(after.length, 1)
  assert.equal(after[0].location, 'L2')
  assert.equal(rowEstimate(after[0], p), 80)
  assert.equal(planMove(r, 81, 'L2', [r], p).ok, false)
  assert.equal(planMove(r, 0, 'L2', [r], p).ok, false)
  assert.equal(planMove(r, 5, 'L1', [r], p).ok, false)
  assert.equal(planMove(r, 5, ' ', [r], p).ok, false)
})

test('AC-3 tách: tổng phần = ước tính, mỗi phần > 0', () => {
  const r = row({ lot_id: 1 }); const p = pk([1, 40])
  const parts = [
    { location: 'L1', batch_no: 'B1', manuf_date: '2026-01-01', qty: 25 },
    { location: 'L2', batch_no: 'B1', manuf_date: '2026-01-01', qty: 35 },
  ]
  const plan = okPlan(planSplit(r, parts, p))
  const after = apply([r], plan.ops)
  assert.equal(after.length, 2)
  assert.equal(total(after, p), 60)
  assert.equal(rowEstimate(after.find((x) => x.location === 'L1')!, p), 25)
  assert.equal(rowEstimate(after.find((x) => x.location === 'L2')!, p), 35)
})

test('AC-3 tách: tổng sai / phần <= 0 / chỉ 1 phần / trùng khoá bị từ chối', () => {
  const r = row(); const p = pk()
  const part = (loc: string, qty: number) => ({ location: loc, batch_no: 'B1', manuf_date: '', qty })
  assert.equal(planSplit(r, [part('L1', 50), part('L2', 40)], p).ok, false)
  assert.equal(planSplit(r, [part('L1', 100), part('L2', 0)], p).ok, false)
  assert.equal(planSplit(r, [part('L1', 120), part('L2', -20)], p).ok, false)
  assert.equal(planSplit(r, [part('L1', 100)], p).ok, false)
  assert.equal(planSplit(r, [part('L1', 50), part('L1', 50)], p).ok, false)
  assert.equal(planSplit(r, [part('L1', 50.5), part('L2', 49.5)], p).ok, true)
})

test('AC-4 gộp: cùng nguồn/SKU/ngày SX/batch, tổng ước tính, xoá dòng thừa', () => {
  const a = row({ lot_id: 1 }); const b = row({ location: 'L2', qty_system: 50, lot_id: 2 }); const c = row({ location: 'L3', qty_system: 7, lot_id: 3 })
  const p = pk([1, 10], [3, 2])
  const plan = okPlan(planMerge([a, b, c], 'L2', p))
  const after = apply([a, b, c], plan.ops)
  assert.equal(after.length, 1)
  assert.equal(after[0].location, 'L2')
  // picks của lô 2, 3 được chuyển sang lô 1 (repoint_picks)
  assert.equal(rowEstimate(after[0], pk([1, 12])), 90 + 50 + 5)
  assert.equal(plan.log.before.length, 3)
})

test('AC-4 gộp bị từ chối kèm lý do', () => {
  const a = row(); const p = pk()
  const reason = (r: EditRow[]) => { const x = planMerge(r, 'L1', p); assert.equal(x.ok, false); return x.ok ? '' : x.error }
  assert.match(reason([a, row({ source_id: 2 })]), /nguồn/)
  assert.match(reason([a, row({ sku: 'S2' })]), /SKU/)
  assert.match(reason([a, row({ manuf_date: '2025-01-01' })]), /Ngày SX/)
  assert.match(reason([a, row({ batch_no: 'B2' })]), /Batch/)
  assert.match(reason([a]), /2 dòng/)
})

test('AC-5 mỗi thao tác có nhật ký (kind, sku, trước, sau)', () => {
  const r = row(); const p = pk()
  const logs = [
    okPlan(planEdit(r, { location: 'X', batch_no: 'B1', manuf_date: '' }, p)).log,
    okPlan(planMove(r, 1, 'Y', [r], p)).log,
    okPlan(planSplit(r, [{ location: 'A', batch_no: '', manuf_date: '', qty: 60 }, { location: 'B', batch_no: '', manuf_date: '', qty: 40 }], p)).log,
    okPlan(planMerge([r, row({ location: 'L2' })], 'L1', p)).log,
  ]
  assert.deepEqual(logs.map((l) => l.kind), ['edit', 'move', 'split', 'merge'])
  for (const l of logs) { assert.equal(l.sku, 'S1'); assert.ok(l.before.length >= 1 && l.after.length >= 1) }
})

test('AC-3 lot_id: sửa giữ lot_id; di chuyển một phần giữ lot gốc, dòng mới lot mới', () => {
  const r = row({ lot_id: 7 }); const p = pk()
  const e = apply([r], okPlan(planEdit(r, { location: 'L9', batch_no: 'B9', manuf_date: '2026-02-02' }, p)).ops)
  assert.equal(e[0].lot_id, 7)
  const m = apply([r], okPlan(planMove(r, 30, 'L2', [r], p)).ops)
  assert.equal(m.find((x) => x.id === r.id)!.lot_id, 7)
  assert.notEqual(m.find((x) => x.id !== r.id)!.lot_id, 7)
})

test('AC-3 lot_id: tách phần 1 giữ lot gốc, phần khác lot mới', () => {
  const r = row({ lot_id: 7 }); const p = pk()
  const parts = [{ location: 'L1', batch_no: 'B1', manuf_date: '2026-01-01', qty: 60 }, { location: 'L2', batch_no: 'B1', manuf_date: '2026-01-01', qty: 40 }]
  const out = apply([r], okPlan(planSplit(r, parts, p)).ops)
  assert.equal(out[0].lot_id, 7)
  assert.notEqual(out[1].lot_id, 7)
})

test('AC-3 lot_id: gộp giữ lot dòng đầu, chuyển picks.lot_id, ghi lot trong nhật ký', () => {
  const a = row({ lot_id: 1 }); const b = row({ location: 'L2', lot_id: 2 }); const c = row({ location: 'L3', lot_id: 3 })
  const plan = okPlan(planMerge([a, b, c], 'L1', pk()))
  const re = plan.ops.filter((o) => o.op === 'repoint_picks')
  assert.deepEqual(re, [{ op: 'repoint_picks', from: 2, to: 1 }, { op: 'repoint_picks', from: 3, to: 1 }])
  assert.equal(plan.log.after[0].lot_id, 1)
  assert.deepEqual(plan.log.before.map((x) => x.lot_id), [1, 2, 3])
})

test('AC-3 lot_id: hai lô trùng hoàn toàn vẫn giữ riêng (không tự gộp khi sửa/di chuyển)', () => {
  const a = row({ lot_id: 1 }); const b = row({ lot_id: 2 }); const p = pk()
  const out = apply([a, b], okPlan(planEdit(a, { location: 'L1', batch_no: 'B1', manuf_date: '2026-01-01' }, p)).ops)
  assert.deepEqual(out.map((x) => x.lot_id), [1, 2])
})

test('AC-5 ca DXS26: hai lô cùng vị trí+batch khác Ngày SX, Đã lấy tính riêng theo lot_id', () => {
  const a = row({ lot_id: 1, qty_system: 200, manuf_date: '2026-10-12' }); const b = row({ lot_id: 2, qty_system: 100, manuf_date: '2026-10-13' })
  const p = pk([1, 150])
  assert.equal(rowEstimate(a, p), 50)
  assert.equal(rowEstimate(b, p), 100)
  const plan = okPlan(planEdit(b, { location: 'L1', batch_no: 'B1', manuf_date: '2026-10-12' }, p))
  const after = apply([a, b], plan.ops)
  assert.equal(rowEstimate(after[0], p), 50)
  assert.equal(rowEstimate(after[1], p), 100)
})
