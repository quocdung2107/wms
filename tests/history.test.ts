import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sumPicked, sumPickedByLot, estimateStock, skuStockInfo, locKey, nowLocal, dateBounds,
  buildCountExport, buildPickExport, periodLabel, countKey, latestCounts, assignCounts, type CountSession, type Pick, type PickLike,
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
  assert.deepEqual(rows[0].slice(10), ['Tổng hệ thống', 'Tồn ước tính', 'Hold', 'Ngày SX', 'Lô #', 'Kỳ'])
  assert.deepEqual(rows[1].slice(10), ['', '', '', '', '', ''])
})

test('buildPickExport: có info -> 3 cột cuối', () => {
  const k: Pick = {
    id: 1, sku: 's1', description: '=d', source: 'A', location: 'L', batch_no: '', uom: '', qty: 2,
    order_no: null, picked_at: '2026-10-05 10:00:00', note: '',
  }
  const rows = buildPickExport([k], new Map([['S1', { total: 10, picked: 4, estimate: -6, hold: 1 }]]))
  assert.deepEqual(rows[1].slice(10, 13), [10, -6, 1])
  assert.equal(rows[1][2], "'=d")
})

test('buildPickExport: có KL -> 2 cột + dòng tổng, SKU thiếu KL để trống', () => {
  const mk = (id: number, sku: string, qty: number): Pick => ({
    id, sku, description: '', source: 'A', location: 'L', batch_no: '', uom: '', qty,
    order_no: null, picked_at: '2026-10-05 10:00:00', note: '',
  })
  const rows = buildPickExport([mk(1, 'a 1', 4), mk(2, 'B2', 3)], undefined, new Map([['A1', 2.5]]))
  assert.equal(rows.length, 4)
  assert.deepEqual(rows[0].slice(16), ['KL đơn vị (kg)', 'KL dòng (kg)'])
  assert.deepEqual(rows[1].slice(16), [2.5, 10])
  assert.deepEqual(rows[2].slice(16), ['', ''])
  assert.equal(rows[3][0], 'Tổng khối lượng')
  assert.equal(rows[3][rows[3].length - 1], 10)
  assert.equal(buildPickExport([mk(1, 'S', 1)])[0].length, 16)
})

test('skuStockInfo: nhiều nguồn/vị trí, lẻ cũng hold, trước loaded_at, không tồn, tồn âm', () => {
  const la = { A: '2026-10-05 09:00:00', B: '2026-10-05 09:00:00' }
  const m = skuStockInfo(
    [{ sku: 'x1', qty_system: 10 }, { sku: 'X1 ', qty_system: null }, { sku: 'X1', qty_system: 5 }, { sku: 'Y', qty_system: 2 }],
    [
      { sku: 'X1', ...p({ qty: 3 }) },
      { sku: 'x1', ...p({ source: 'B', qty: 4, pick_order_id: 7 }) },
      { sku: 'X1', ...p({ qty: 9, picked_at: '2026-10-05 08:00:00', pick_order_id: 7 }) },
      { sku: 'NOSTOCK', ...p({ qty: 6, pick_order_id: 1 }) },
      { sku: 'Y', ...p({ qty: 5 }) },
    ],
    la,
  )
  assert.deepEqual(m.get('X1'), { total: 15, picked: 7, estimate: 8, hold: 7 })
  assert.deepEqual(m.get('NOSTOCK'), { total: 0, picked: 6, estimate: -6, hold: 6 })
  assert.deepEqual(m.get('Y'), { total: 2, picked: 5, estimate: -3, hold: 5 })
})

const cs = (o: Partial<CountSession> = {}): CountSession => ({
  id: 1, sku: 'X1', description: '', source: 'A', location: 'L1', batch_no: 'B1', uom: '', qty_system: 10,
  qty_counted: 5, diff: -5, counted_at: '2026-10-05 10:00:00', note: '', ...o,
})

test('latestCounts: lấy bản mới nhất, hoà giờ -> id lớn, khoá khác tách riêng', () => {
  const m = latestCounts([
    cs({ id: 1, qty_counted: 1 }),
    cs({ id: 2, qty_counted: 2, counted_at: '2026-10-06 10:00:00' }),
    cs({ id: 3, qty_counted: 3, counted_at: '2026-10-04 10:00:00' }),
    cs({ id: 5, qty_counted: 50, location: 'L2' }),
    cs({ id: 7, qty_counted: 70, location: 'L2' }),
    cs({ id: 6, qty_counted: 60, location: 'L2' }),
  ])
  assert.equal(m.size, 2)
  assert.equal(m.get(countKey('A', 'L1', 'B1', 'X1'))?.qty_counted, 2)
  assert.equal(m.get(countKey('A', 'L2', 'B1', 'X1'))?.qty_counted, 70)
})

test('latestCounts: null/rỗng và hoa thường SKU coi như nhau', () => {
  const m = latestCounts([
    cs({ id: 1, location: '', batch_no: '', sku: 'ab ', qty_counted: 1 }),
    cs({ id: 2, location: '', batch_no: '', sku: 'AB', qty_counted: 2 }),
  ])
  assert.equal(m.size, 1)
  assert.equal(m.get(countKey('A', null, null, 'Ab'))?.qty_counted, 2)
  assert.equal(latestCounts([]).size, 0)
})

test('assignCounts: chỉ dòng đầu của khoá nhận số; chưa đếm thì trống', () => {
  const counted = latestCounts([cs({ qty_counted: 9 })])
  const lines = [
    { key: 'a', location: 'L1', batch_no: 'B1', sku: 'x1' },
    { key: 'b', location: 'L1', batch_no: 'B1', sku: 'X1' },
    { key: 'c', location: 'L9', batch_no: 'B1', sku: 'X1' },
  ]
  for (const merge of [false, true]) {
    const m = assignCounts(lines, counted, { merge, source: 'A' })
    assert.deepEqual([...m], [['a', 9]])
  }
  assert.equal(assignCounts(lines, counted, { source: 'Z' }).size, 0)
  assert.deepEqual([...assignCounts([{ ...lines[0], source: 'A' }], counted)], [['a', 9]])
})

test('sumPickedByLot: ca DXS26, 2 lô cùng vị trí+batch tách riêng, bỏ pick chưa rõ lô', () => {
  const m = sumPickedByLot(
    [p({ lot_id: 1, qty: 150 } as never), p({ lot_id: 1, qty: 0 } as never), p({ lot_id: null, qty: 7 } as never), p({ lot_id: 2, qty: 5, picked_at: '2026-10-05 08:00:00' } as never)],
    { A: '2026-10-05 09:00:00' },
  )
  assert.equal(m.get(1), 150)
  assert.equal(m.get(2), undefined)
  assert.equal(m.size, 1)
})

test('buildPickExport: Ngày SX, Lô #, Kỳ; kỳ cũ có nhãn đã đóng; cần xác nhận', () => {
  const base: Pick = {
    id: 1, sku: 'S', description: '', source: 'A', location: 'L', batch_no: 'B', uom: '', qty: 2,
    order_no: null, picked_at: '2026-10-05 10:00:00', note: '',
  }
  const rows = buildPickExport([
    { ...base, lot_id: 7, manuf_date: '2026-10-12', period: 2, closed: false },
    { ...base, id: 2, lot_id: null, manuf_date: '', period: 1, closed: true, needs_review: true },
  ])
  assert.deepEqual(rows[1].slice(13), ['2026-10-12', 7, 'kỳ 2'])
  assert.deepEqual(rows[2].slice(13), ['', '', 'kỳ 1 (đã đóng) - cần xác nhận'])
  assert.equal(periodLabel(null), '')
  assert.equal(periodLabel(3, true), 'kỳ 3 (đã đóng)')
})
