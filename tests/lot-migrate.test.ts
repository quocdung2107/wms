import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lotUpgradeSql, planLotMigration, type LotPick, type LotRow, type MigrationInput } from '../src/shared/inventory/lot-migrate.ts'

let rid = 1
const row = (o: Partial<LotRow> = {}): LotRow => ({
  id: rid++, sku: 'S1', source: 'A', location: 'L1', batch_no: 'B1', manuf_date: '2026-10-12', qty_system: 200, lot_id: null, ...o,
})
let pid = 1
const pick = (o: Partial<LotPick> = {}): LotPick => ({
  id: pid++, sku: 'S1', description: '', source: 'A', location: 'L1', batch_no: 'B1', uom: 'PCS', qty: 10, order_no: null,
  picked_at: '2026-10-10 09:00:00', note: '', pick_order_id: null, lot_id: null, period: null, ...o,
})
const input = (rows: LotRow[], picks: LotPick[], o: Partial<MigrationInput> = {}): MigrationInput => ({
  rows, picks, counter: 0, loadedAt: { A: '2026-10-01 00:00:00' }, currentPeriod: { A: 1 }, ...o,
})
const full = { inventory_rows: ['lot_id'], picks: ['lot_id', 'period', 'needs_review'], sources: ['period'], pick_order_lines: ['batch_no', 'manuf_date'] }

test('AC-1 lotUpgradeSql: DB cũ thêm đủ cột, DB mới chỉ còn lệnh idempotent', () => {
  const old = lotUpgradeSql({ inventory_rows: [], picks: [], sources: [], pick_order_lines: [] })
  for (const c of ['inventory_rows ADD COLUMN lot_id', 'picks ADD COLUMN lot_id', 'picks ADD COLUMN period', 'sources ADD COLUMN period', 'pick_order_lines ADD COLUMN batch_no', 'pick_order_lines ADD COLUMN manuf_date', 'lot_counter']) {
    assert.ok(old.some((s) => s.includes(c)), c)
  }
  assert.equal(lotUpgradeSql(full).filter((s) => s.startsWith('ALTER')).length, 0)
})

test('AC-1 cấp lot_id tăng dần từ lot_counter, chạy lại không đổi', () => {
  const rows = [row(), row({ location: 'L2' })]
  const p1 = planLotMigration(input(rows, [], { counter: 5 }))
  assert.deepEqual(p1.assigned.map((a) => a.lotId), [6, 7])
  assert.equal(p1.counter, 7)
  const after = rows.map((r, i) => ({ ...r, lot_id: p1.assigned[i].lotId }))
  const p2 = planLotMigration(input(after, [], { counter: p1.counter }))
  assert.equal(p2.statements.length, 0)
  assert.equal(p2.counter, 7)
})

test('AC-2 pick trước loaded_at -> period 0', () => {
  const pk = pick({ picked_at: '2026-09-30 10:00:00' })
  const p = planLotMigration(input([row()], [pk]))
  assert.equal(p.stats.period0, 1)
  const s = p.statements.find((x) => x.sql.startsWith('UPDATE picks'))!
  assert.deepEqual(s.bind, [null, 0, 0, null, pk.id])
})

test('AC-2 khớp 1 dòng -> gán lot_id', () => {
  const r = row()
  const pk = pick()
  const p = planLotMigration(input([r], [pk], { counter: 9 }))
  const s = p.statements.find((x) => x.sql.startsWith('UPDATE picks'))!
  assert.deepEqual(s.bind, [10, 1, 0, null, pk.id])
})

test('AC-2 0 dòng -> lot_id rỗng, vẫn tính (period hiện tại)', () => {
  const pk = pick({ location: 'KHAC' })
  const p = planLotMigration(input([row()], [pk]))
  assert.equal(p.stats.unknownLot, 1)
  const s = p.statements.find((x) => x.sql.startsWith('UPDATE picks'))!
  assert.deepEqual(s.bind, [null, 1, 0, null, pk.id])
})

test('AC-2 >=2 dòng -> FIFO theo Ngày SX cũ trước, tách bản ghi, cần xác nhận (ca DXS26)', () => {
  const r13 = row({ manuf_date: '2026-10-13', qty_system: 100 })
  const r12 = row({ manuf_date: '2026-10-12', qty_system: 200 })
  const pk = pick({ qty: 250 })
  const p = planLotMigration(input([r13, r12], [pk]))
  const lot = (r: LotRow) => p.assigned.find((a) => a.rowId === r.id)!.lotId
  const upd = p.statements.find((x) => x.sql.startsWith('UPDATE picks'))!
  const ins = p.statements.filter((x) => x.sql.startsWith('INSERT INTO picks'))
  assert.deepEqual(upd.bind, [lot(r12), 1, 1, 200, pk.id])
  assert.equal(ins.length, 1)
  assert.equal(ins[0].bind![6], 50)
  assert.equal(ins[0].bind![11], lot(r13))
  assert.equal(ins[0].bind![13], 1)
  assert.equal(p.stats.needsReview, 2)
})

test('AC-2 phần vượt tổng SL còn lại -> bản ghi không lô; SL đã dùng bởi pick trước được trừ', () => {
  const r1 = row({ manuf_date: '2026-10-12', qty_system: 100 })
  const r2 = row({ manuf_date: '2026-10-13', qty_system: 50 })
  const p = planLotMigration(input([r1, r2], [
    pick({ qty: 120, picked_at: '2026-10-10 08:00:00' }),
    pick({ qty: 60, picked_at: '2026-10-10 09:00:00' }),
  ]))
  const ins = p.statements.filter((x) => x.sql.startsWith('INSERT INTO picks'))
  // pick1: 100 lô1 + insert 20 lô2; pick2: update 30 lô2 + insert 30 dư không lô
  assert.equal(ins.length, 2)
  assert.equal(ins[1].bind![6], 30)
  assert.equal(ins[1].bind![11], null)
  const total = p.statements.filter((x) => x.sql.startsWith('INSERT INTO picks')).reduce((n, x) => n + (x.bind![6] as number), 0)
  assert.equal(total, 20 + 30)
})

test('AC-2 pick đã chuyển đổi (period != null) không bị chuyển lại', () => {
  const r = row({ lot_id: 3 })
  const p = planLotMigration(input([r], [pick({ period: 1, lot_id: 3 })], { counter: 3 }))
  assert.equal(p.statements.length, 0)
})
