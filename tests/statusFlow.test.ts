import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextStatus } from '../src/features/orders/statusFlow.ts'

test('nextStatus đi đúng thứ tự', () => {
  assert.equal(nextStatus('CREATED'), 'CONFIRMED')
  assert.equal(nextStatus('CONFIRMED'), 'PICKING')
  assert.equal(nextStatus('PICKING'), 'IN_TRANSIT')
  assert.equal(nextStatus('IN_TRANSIT'), 'DELIVERED')
})

test('nextStatus null cho DELIVERED/COMPLETED/không rõ', () => {
  assert.equal(nextStatus('DELIVERED'), null)
  assert.equal(nextStatus('COMPLETED'), null)
  assert.equal(nextStatus('XYZ'), null)
})
