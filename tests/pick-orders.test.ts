import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../src/shared/excel/reader.ts'
import {
  formatPkCode, lineProgress, mergeLines, normOrderRef, parsePickSheet, pickedBySku, picksUpgradeSql, weighLines, pickOrdersUpgradeSql, planAttach, allocPicked,
} from '../src/features/pick-orders/logic.ts'

test('formatPkCode: PK-0001, tăng dần, quá 4 chữ số vẫn đúng', () => {
  assert.equal(formatPkCode(1), 'PK-0001')
  assert.equal(formatPkCode(2), 'PK-0002')
  assert.equal(formatPkCode(123), 'PK-0123')
  assert.equal(formatPkCode(12345), 'PK-12345')
})

test('normOrderRef', () => {
  assert.equal(normOrderRef(' dh-0001 '), 'DH-0001')
  assert.equal(normOrderRef('   '), null)
  assert.equal(normOrderRef(null), null)
})

test('mergeLines: SKU trùng cộng dồn, không phân biệt hoa thường', () => {
  const m = mergeLines([
    { sku: 'A1', description: '', uom: '', qty_need: 2 },
    { sku: 'a1', description: 'Hàng A', uom: 'Cái', qty_need: 3 },
    { sku: 'B2', description: '', uom: '', qty_need: 1 },
  ])
  assert.equal(m.length, 2)
  assert.deepEqual(m[0], { sku: 'A1', description: 'Hàng A', uom: 'Cái', qty_need: 5 })
})

function sheetFrom(aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return readWorkbook(buf)[0]
}

test('parsePickSheet: cộng dồn SKU trùng, báo dòng lỗi, không hỏng cả file', () => {
  const r = parsePickSheet(sheetFrom([
    ['SKU', 'Số lượng', 'Tên hàng'],
    ['A1', 5, 'Hàng A'],
    ['B2', 'abc', 'Hàng B'],
    ['A1', '3,5', ''],
    ['C3', 0, ''],
    ['', '', ''],
    ['D4', 2, ''],
  ]))
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.lines.map((l) => [l.sku, l.qty_need]), [['A1', 8.5], ['D4', 2]])
  assert.equal(r.lines[0].description, 'Hàng A')
  assert.equal(r.errors.length, 2)
  assert.equal(r.errors[0].row, 3)
  assert.match(r.errors[0].message, /không phải số/)
})

test('parsePickSheet: thiếu cột', () => {
  const r = parsePickSheet(sheetFrom([['Tên', 'Ghi chú'], ['x', 'y']]))
  assert.deepEqual(r.missing, ['SKU', 'Số lượng'])
  assert.equal(r.lines.length, 0)
})

test('lineProgress / pickedBySku', () => {
  assert.deepEqual(lineProgress(10, 4), { need: 10, picked: 4, missing: 6, extra: 0, pct: 40 })
  assert.deepEqual(lineProgress(10, 12), { need: 10, picked: 12, missing: 0, extra: 2, pct: 100 })
  const m = pickedBySku([{ sku: 'a1', qty: 2 }, { sku: 'A1', qty: 3 }])
  assert.equal(m.get('A1'), 5)
})

test('picksUpgradeSql: DB cũ chưa có cột -> ALTER; đã có -> không ALTER lại', () => {
  const old = ['id', 'sku', 'qty', 'order_no', 'picked_at']
  const up = picksUpgradeSql(old)
  assert.ok(up.some((s) => /ALTER TABLE picks ADD COLUMN pick_order_id/.test(s)))
  assert.ok(up.some((s) => /CREATE INDEX IF NOT EXISTS idx_picks_order/.test(s)))
  const again = picksUpgradeSql([...old, 'pick_order_id'])
  assert.ok(!again.some((s) => /ALTER/.test(s)))
})

test('pickOrdersUpgradeSql: thiếu cột -> ALTER, đủ -> rỗng', () => {
  assert.ok(pickOrdersUpgradeSql(['id', 'code']).some((q) => q.includes('ADD COLUMN allow_sku_tag')))
  assert.deepEqual(pickOrdersUpgradeSql(['id', 'allow_sku_tag', 'customer_code']), [])
  const only = pickOrdersUpgradeSql(['id', 'allow_sku_tag'])
  assert.equal(only.length, 1)
  assert.ok(only[0].includes('ADD COLUMN customer_code'))
  assert.equal(pickOrdersUpgradeSql(['id']).length, 2)
})

test('weighLines: SKU thiếu KL là null, không tính vào tổng, đếm missing', () => {
  const w = new Map([['A1', 2.5]])
  const r = weighLines([{ sku: 'a 1', qty: 4 }, { sku: 'B2', qty: 3 }, { sku: 'A1', qty: 0 }], w)
  assert.equal(r.rows[0].unitKg, 2.5)
  assert.equal(r.rows[0].lineKg, 10)
  assert.equal(r.rows[1].unitKg, null)
  assert.equal(r.rows[1].lineKg, null)
  assert.equal(r.rows[2].lineKg, 0)
  assert.equal(r.totalKg, 10)
  assert.equal(r.missing, 1)
  assert.equal(weighLines([{ sku: 'X', qty: 1 }], new Map()).totalKg, 0)
})

test('planAttach: 3 trường hợp', () => {
  const pick = { sku: 'a1', description: 'Hàng A', uom: 'Cái', qty: 4 }
  assert.deepEqual(planAttach([{ sku: 'A1' }], pick, false), { ok: true, addLine: null })
  assert.deepEqual(planAttach([{ sku: 'B2' }], pick, true), {
    ok: true, addLine: { sku: 'a1', description: 'Hàng A', uom: 'Cái', qty_need: 4 },
  })
  const r = planAttach([], pick, false)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /chưa bật cho phép gắn thẻ SKU/)
})

test('mergeLines: gộp theo (SKU, Batch, Ngày SX)', () => {
  const m = mergeLines([
    { sku: 'A1', description: '', uom: '', qty_need: 2, batch_no: 'b1', manuf_date: '2026-01-01' },
    { sku: 'a1', description: '', uom: '', qty_need: 3, batch_no: 'B1', manuf_date: '2026-01-01' },
    { sku: 'A1', description: '', uom: '', qty_need: 4, batch_no: 'B1', manuf_date: '2026-02-01' },
    { sku: 'A1', description: '', uom: '', qty_need: 1 },
  ])
  assert.deepEqual(m.map((l) => l.qty_need), [5, 4, 1])
})

test('parsePickSheet: cột Batch và Ngày SX (alias), ngày sai báo lỗi theo dòng', () => {
  const r = parsePickSheet(sheetFrom([
    ['SKU', 'Số lượng', 'Batch', 'Ngày SX'],
    ['A1', 5, 'B1', '12/10/2026'],
    ['A1', 2, 'B1', '2026-10-12'],
    ['A1', 3, 'B1', '13/10/2026'],
    ['A1', 4, 'B1', '31/02/2026'],
    ['C3', 1, '', ''],
  ]))
  assert.deepEqual(r.lines.map((l) => [l.sku, l.batch_no, l.manuf_date, l.qty_need]), [
    ['A1', 'B1', '2026-10-12', 7], ['A1', 'B1', '2026-10-13', 3], ['C3', '', '', 1],
  ])
  assert.equal(r.errors.length, 1)
  assert.equal(r.errors[0].row, 5)
  assert.match(r.errors[0].message, /Ngày SX/)
})

test('parsePickSheet: file không có cột Batch/Ngày SX chạy như cũ', () => {
  const r = parsePickSheet(sheetFrom([['SKU', 'Số lượng'], ['A1', 1]]))
  assert.deepEqual(r.lines, [{ sku: 'A1', qty_need: 1, description: '', uom: '' }])
})

test('allocPicked: chia theo SKU, dòng có lô trước, dư dồn dòng đầu', () => {
  const lines = [
    { sku: 'A', qty_need: 10 },
    { sku: 'A', qty_need: 6, batch_no: 'B1' },
    { sku: 'B', qty_need: 5 },
  ]
  assert.deepEqual(allocPicked(lines, new Map([['A', 9], ['B', 7]])), [3, 6, 7])
  assert.deepEqual(allocPicked(lines, new Map()), [0, 0, 0])
})
