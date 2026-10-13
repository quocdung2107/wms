import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestPick } from '../src/features/pick-orders/suggest.ts'
import type { EditRow } from '../src/shared/inventory/edit.ts'

let n = 0
const row = (o: Partial<EditRow>): EditRow => ({
  id: ++n, source_id: 1, source: 'S', warehouse: '', location: 'A1', sku: 'X', description: '', category: '', uom_raw: '',
  qty_system: 10, qty_available: null, qty_damaged: null, qty_hold: null, condition: '', batch_no: '', lot_no: '',
  manuf_date: '', receive_date: '', expiry_date: '', ...o,
} as EditRow)
const ids = (rows: EditRow[], need: number) => suggestPick(rows, need).items.map((i) => i.row.id)

test('bỏ dòng tồn <= 0, Hold hết khả dụng, chỉ hỏng', () => {
  const a = row({ qty_system: 0, manuf_date: '2024-01-01' })
  const b = row({ qty_system: -3, manuf_date: '2024-01-01' })
  const c = row({ qty_system: 10, qty_hold: 10, qty_available: 0, manuf_date: '2024-01-01' })
  const d = row({ qty_system: 10, qty_damaged: 10, manuf_date: '2024-01-01' })
  const ok = row({ manuf_date: '2024-05-01' })
  assert.deepEqual(ids([a, b, c, d, ok], 5), [ok.id])
})

test('Hold một phần: chỉ lấy phần khả dụng; cột trống dùng tồn ước tính', () => {
  const h = row({ qty_system: 10, qty_hold: 4, qty_available: 6, manuf_date: '2024-01-01' })
  assert.equal(suggestPick([h], 10).items[0].qty, 6)
  assert.equal(suggestPick([h], 10).missing, 4)
  const h2 = row({ qty_system: 10, qty_hold: 4, qty_available: null, manuf_date: '2024-01-01' })
  assert.equal(suggestPick([h2], 10).items[0].qty, 10)
})

test('không ngày và không batch xếp trước', () => {
  const dated = row({ manuf_date: '2020-01-01' })
  const bare = row({})
  const batchOnly = row({ batch_no: 'B1' })
  assert.deepEqual(ids([dated, batchOnly, bare], 1), [bare.id])
  assert.deepEqual(ids([dated, batchOnly, bare], 100), [bare.id, dated.id, batchOnly.id])
})

test('Ngày SX tăng dần; thiếu thì dùng Hạn dùng; ngày sai coi như thiếu', () => {
  const a = row({ manuf_date: '2024-03-01' })
  const b = row({ manuf_date: '2024-01-01' })
  const c = row({ expiry_date: '15/02/2024' })
  const d = row({ batch_no: 'B', manuf_date: 'abc' })
  assert.deepEqual(ids([a, b, c, d], 100), [b.id, c.id, a.id, d.id])
})

test('hoà ngày: tồn ít trước; hoà nữa: Location theo chữ cái', () => {
  const big = row({ qty_system: 20, manuf_date: '2024-01-01', location: 'A1' })
  const small = row({ qty_system: 5, manuf_date: '2024-01-01', location: 'Z9' })
  assert.deepEqual(ids([big, small], 100), [small.id, big.id])
  const l2 = row({ qty_system: 5, manuf_date: '2024-01-01', location: 'B2' })
  const l10 = row({ qty_system: 5, manuf_date: '2024-01-01', location: 'B10' })
  const l1 = row({ qty_system: 5, manuf_date: '2024-01-01', location: 'A3' })
  assert.deepEqual(ids([l10, l2, l1], 100), [l1.id, l2.id, l10.id])
})

test('chia nhiều dòng và thiếu hàng', () => {
  const a = row({ qty_system: 4, manuf_date: '2024-01-01' })
  const b = row({ qty_system: 10, manuf_date: '2024-02-01' })
  const r = suggestPick([b, a], 7)
  assert.deepEqual(r.items.map((i) => [i.row.id, i.qty]), [[a.id, 4], [b.id, 3]])
  assert.equal(r.missing, 0)
  const s = suggestPick([b, a], 20)
  assert.deepEqual(s.items.map((i) => i.qty), [4, 10])
  assert.equal(s.missing, 6)
})

test('trừ đã lấy theo khoá', () => {
  const a = row({ qty_system: 10, location: 'A1', manuf_date: '2024-01-01' })
  const picked = new Map([['S||A1||', 0]])
  assert.equal(suggestPick([a], 5, picked).items[0].qty, 5)
})
