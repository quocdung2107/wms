import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  freshnessOf,
  freshnessLabel,
  FRESHNESS_LABELS,
} from '../src/features/carriers/freshness.ts'

const now = new Date('2026-10-05T00:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

test('freshness: các mốc ngày', () => {
  assert.equal(freshnessOf(ago(0), now), 'recent')
  assert.equal(freshnessOf(ago(6.9), now), 'recent')
  assert.equal(freshnessOf(ago(7), now), 'not_recent')
  assert.equal(freshnessOf(ago(30), now), 'not_recent')
  assert.equal(freshnessOf(ago(30.1), now), 'outdated')
})

test('freshness: null/không hợp lệ -> outdated', () => {
  assert.equal(freshnessOf(null, now), 'outdated')
  assert.equal(freshnessOf(undefined, now), 'outdated')
  assert.equal(freshnessOf('abc', now), 'outdated')
})

test('freshness: nhãn đúng và không có "ngừng hoạt động"', () => {
  assert.equal(freshnessLabel(ago(1), now), 'Active recently')
  assert.equal(freshnessLabel(ago(10), now), 'Not recently verified')
  assert.equal(freshnessLabel(null, now), 'Information may be outdated')
  for (const l of Object.values(FRESHNESS_LABELS))
    assert.ok(!/ngừng hoạt động/i.test(l))
})
