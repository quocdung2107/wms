import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWeightSheet, weightKey } from '../src/shared/inventory/weight.ts'
import type { SheetData } from '../src/shared/excel/reader.ts'

const sheet = (matrix: SheetData['matrix']): SheetData => ({ name: 'S', matrix, merges: [], formulaCols: [] })

test('weightKey: bỏ khoảng trắng, không phân biệt hoa thường', () => {
  assert.equal(weightKey(' ab 12 '), 'AB12')
  assert.equal(weightKey('Ab12'), weightKey('aB 12'))
})

test('parseWeightSheet: đọc, bỏ dòng lỗi, đếm skipped', () => {
  const r = parseWeightSheet(sheet([
    ['SKU', 'KG'],
    ['A1', 1.5],
    ['B2', '2,5'],
    ['C3', ''],
    ['D4', 'abc'],
    ['E5', 0],
    ['F6', -1],
    ['', 3],
    [null, null],
  ]), 0, 1)
  assert.deepEqual(r.rows.map((x) => [x.key, x.weight_kg]), [['A1', 1.5], ['B2', 2.5]])
  assert.equal(r.skipped, 5)
})

test('parseWeightSheet: SKU trùng lấy dòng cuối, chỉ số cột tuỳ chọn', () => {
  const r = parseWeightSheet(sheet([
    ['x', 'KG', 'SKU'],
    ['', 1, 'a 1'],
    ['', 4, 'A1'],
  ]), 2, 1)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].weight_kg, 4)
  assert.equal(r.rows[0].sku, 'A1')
})
