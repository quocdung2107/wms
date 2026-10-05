import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupe, dedupeKey, mapHeader, normalizePhone, normalizePhones, parseMatrix } from '../scripts/seed-carriers.ts'

test('chuẩn hoá SĐT: +84, 84, dấu chấm, số mất 0 đầu', () => {
  assert.equal(normalizePhone('+84 912 345 678'), '0912345678')
  assert.equal(normalizePhone('84912345678'), '0912345678')
  assert.equal(normalizePhone('0912.345.678'), '0912345678')
  assert.equal(normalizePhone(912345678), '0912345678')
  assert.equal(normalizePhone('abc'), null)
  assert.deepEqual(normalizePhones('0912345678 / 0987.654.321, +84912345678'), ['0912345678', '0987654321'])
})

test('mapHeader nhận tiêu đề tiếng Việt có dấu', () => {
  const m = mapHeader(['Tên', 'SĐT', 'Khu vực', 'Loại xe', 'Email'])
  assert.deepEqual(m, { name: 0, phone: 1, regions: 2, vehicle_types: 3, email: 4 })
})

test('parseMatrix bỏ dòng thiếu tên và dòng quá dài', () => {
  const { rows, skipped } = parseMatrix([
    ['Tên', 'SĐT', 'Khu vực'],
    ['Vận tải A', '0912345678', 'HCM; Hà Nội'],
    [null, '0900000000', null],
    ['x'.repeat(121), null, null],
  ])
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].regions, ['HCM', 'Hà Nội'])
  assert.equal(skipped.length, 2)
})

test('chống trùng: cùng tên + SĐT khác định dạng; với DB và trong file', () => {
  assert.equal(dedupeKey(' Vận  Tải A ', '+84912345678'), dedupeKey('vận tải a', '0912345678'))
  const base = { description: '', regions: [], vehicle_types: [], email: null, zalo: null }
  const rows = [
    { ...base, name: 'A', phone: '0912345678' },
    { ...base, name: 'a', phone: '+84912345678' },
    { ...base, name: 'A', phone: '0900000000' },
    { ...base, name: 'B', phone: null },
  ]
  const r1 = dedupe(rows, new Set())
  assert.equal(r1.fresh.length, 3)
  assert.equal(r1.duplicates.length, 1)
  const r2 = dedupe(rows, new Set(r1.fresh.map((r) => dedupeKey(r.name, r.phone))))
  assert.equal(r2.fresh.length, 0) // chạy lại không thêm gì
})
