import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExpired } from '../src/features/orders/imageExpiry.ts'

const now = Date.parse('2026-10-09T12:00:00Z')

test('isExpired: cờ expired', () => {
  assert.equal(isExpired({ expired: true }, now), true)
})
test('isExpired: theo expires_at', () => {
  assert.equal(isExpired({ expires_at: '2026-10-09T11:59:59Z' }, now), true)
  assert.equal(isExpired({ expires_at: '2026-10-09T12:00:00Z' }, now), true)
  assert.equal(isExpired({ expires_at: '2026-10-09T12:00:01Z' }, new Date(now)), false)
})
test('isExpired: thiếu cột hoặc ngày sai là còn hạn', () => {
  assert.equal(isExpired({}, now), false)
  assert.equal(isExpired({ expires_at: null, expired: false }, now), false)
  assert.equal(isExpired({ expires_at: 'abc' }, now), false)
})
