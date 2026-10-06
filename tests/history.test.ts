import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sumPicked, estimateStock, locKey, nowLocal, dateBounds,
  buildCountExport, buildPickExport, type CountSession, type Pick, type PickLike,
} from '../src/shared/inventory/history.ts'

const p = (o: Partial<PickLike> = {}): PickLike =>
  ({ source: 'A', location: 'L1', batch_no: 'B1', qty: 5, picked_at: '2026-10-05 10:00:00', ...o })

test('sumPicked: chỉ tính picks >= loaded_at, gộp theo vị trí/batch', () => {
  const m = sumPicked(
    [p(), p({ qty: 3 }), p({ picked_at: '2026-10-05 08:00:00' }), p({ batch_no: 'B2' }), p({ source: 'Z' })],
    { A: '2026-10-05 09:00:00' },
  )
  assert.equal(m.get(locKey('A', 'L1', 'B1')), 8)
  assert.equal(m.get(locKey('A', 'L1', 'B2')), 5)
  assert.equal(m.size, 2)
})

test('sumPicked: nạp lại file (loaded_at mới) -> về 0', () => {
  assert.equal(sumPicked([p()], { A: '2026-10-06 00:00:00' }).size, 0)
})

test('sumPicked: bằng loaded_at vẫn tính; null/rỗng khớp nhau', () => {
  const m = sumPicked([p({ picked_at: '2026-10-05 09:00:00', location: null, batch_no: '' })], { A: '2026-10-05 09:00:00' })
  assert.equal(m.get(locKey('A', '', '')), 5)
})

test('estimateStock', () => {
  assert.equal(estimateStock(100, 30), 70)
  assert.equal(estimateStock(null, 4), -4)
})

test('nowLocal / dateBounds', () => {
  assert.equal(nowLocal(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02 03:04:05')
  assert.deepEqual(dateBounds({ from: '2026-10-01', to: '2026-10-05' }), { from: '2026-10-01 00:00:00', to: '2026-10-05 23:59:59' })
  assert.deepEqual(dateBounds({}), { from: null, to: null })
})

test('buildCountExport: csvSafe + phép tính', () => {
  const s: CountSession = {
    id: 1, sku: '=SKU', description: '+d', source: 'A', location: 'L1', batch_no: '', uom: 'Thùng',
    qty_system: 10, qty_counted: 9, diff: 1, counted_at: '2026-10-05 10:00:00', note: '@x',
  }
  const rows = buildCountExport([s], { 1: [{ seq: 1, expr: '6*12', value: 72 }, { seq: 2, expr: '2', value: 2 }] })
  assert.equal(rows.length, 2)
  assert.equal(rows[1][1], "'=SKU")
  assert.equal(rows[1][2], "'+d")
  assert.equal(rows[1][10], '6*12 = 72; 2 = 2')
  assert.equal(rows[1][11], "'@x")
})

test('buildPickExport: số đơn trống, csvSafe', () => {
  const k: Pick = {
    id: 1, sku: 'S', description: '', source: 'A', location: 'L', batch_no: '', uom: '', qty: 2,
    order_no: null, picked_at: '2026-10-05 10:00:00', note: '-cmd',
  }
  const rows = buildPickExport([k])
  assert.equal(rows[1][8], '')
  assert.equal(rows[1][9], "'-cmd")
  assert.equal(rows[1][7], 2)
})
