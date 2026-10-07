import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPickSummary, matchPickOrders, SUMMARY_MAX } from '../src/features/pick-orders/summary.ts'

const lines = [
  { sku: 'A1', description: '', uom: 'Thùng', qty_need: 10 },
  { sku: 'B2', description: '', uom: 'Cái', qty_need: 5 },
  { sku: 'C3', description: '', uom: 'Thùng', qty_need: 2 },
]
const base = { pickCode: 'PK-0001', orderCode: 'DH-0001', lines, picks: [{ sku: 'a1', qty: 4 }, { sku: 'B2', qty: 5 }] }

test('summary có đủ thông tin, tổng theo ĐVT, không có Khối lượng', () => {
  const t = buildPickSummary({ ...base, customerName: 'Anh Nam', customerAddress: '12 Lê Lợi', shipmentCode: 'VC123' })
  assert.match(t, /PK-0001 \/ DH-0001/)
  assert.match(t, /Người đặt: Anh Nam/)
  assert.match(t, /Địa chỉ đặt: 12 Lê Lợi/)
  assert.match(t, /Mã vận chuyển: VC123/)
  assert.match(t, /Số dòng SKU: 3/)
  assert.match(t, /4\/12 Thùng/)
  assert.match(t, /5\/5 Cái/)
  assert.doesNotMatch(t, /Khối lượng/)
})

test('bỏ dòng không có dữ liệu; Khối lượng chỉ hiện khi truyền', () => {
  const t = buildPickSummary(base)
  assert.doesNotMatch(t, /Người đặt|Địa chỉ|Mã vận chuyển/)
  assert.match(buildPickSummary({ ...base, weightText: '12 kg' }), /Khối lượng: 12 kg/)
})

test('danh sách dài bị cắt, tin <= 2000 ký tự', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ sku: `SKU-${i}`, description: '', uom: 'Cái', qty_need: 1 }))
  const t = buildPickSummary({ ...base, lines: many, customerAddress: 'x'.repeat(300) })
  assert.ok(t.length <= SUMMARY_MAX)
  assert.match(t, /dòng nữa/)
  assert.match(t, /Số dòng SKU: 500/)
  assert.ok(buildPickSummary({ ...base, customerAddress: 'y'.repeat(5000) }).length <= SUMMARY_MAX)
})

test('matchPickOrders so khớp mã Order không phân biệt hoa/thường, khoảng trắng', () => {
  const list = [{ order_ref: 'DH-0001' }, { order_ref: null }, { order_ref: 'DH-0002' }]
  assert.equal(matchPickOrders(list, ' dh-0001 ').length, 1)
  assert.equal(matchPickOrders(list, 'DH-9').length, 0)
  assert.equal(matchPickOrders(list, '').length, 0)
})
