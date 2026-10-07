import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitSize, takeImages } from '../src/features/orders/imageUtils.ts'

test('fitSize: ảnh lớn thu về cạnh dài 1600, giữ tỉ lệ', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 })
  assert.deepEqual(fitSize(3000, 4000), { width: 1200, height: 1600 })
})

test('fitSize: ảnh nhỏ không phóng to', () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 })
  assert.deepEqual(fitSize(1600, 1600), { width: 1600, height: 1600 })
})

test('fitSize: ảnh rất dẹt không về 0', () => {
  assert.deepEqual(fitSize(10000, 1), { width: 1600, height: 1 })
})

test('takeImages: tối đa 10, báo số ảnh thừa', () => {
  const r = takeImages([1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12])
  assert.equal(r.list.length, 10)
  assert.equal(r.dropped, 2)
  assert.deepEqual(takeImages([], [1, 2]), { list: [1, 2], dropped: 0 })
})
