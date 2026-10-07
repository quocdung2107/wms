import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../src/shared/excel/reader.ts'
import {
  formatPkCode, lineProgress, mergeLines, normOrderRef, parsePickSheet, pickedBySku, picksUpgradeSql,
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
