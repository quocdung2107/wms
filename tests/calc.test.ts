import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalExpr, sumLines, calcDiff, lotRemaining, checkLotPick } from '../src/features/sku-lookup/calc.ts'

const val = (s: string) => { const r = evalExpr(s); return r.ok ? r.value : null }

test('evalExpr: phép tính hợp lệ', () => {
  assert.equal(val('6*12'), 72)
  assert.equal(val('90*7-3'), 627)
  assert.equal(val('6x12'), 72)
  assert.equal(val('6X12'), 72)
  assert.equal(val('(1+2)*3'), 9)
  assert.equal(val('1.5*2'), 3)
  assert.equal(val('-3+5'), 2)
  assert.equal(val(' 10 / 4 '), 2.5)
  assert.equal(val('2+3*4'), 14)
})

test('evalExpr: lỗi không ném', () => {
  for (const bad of ['', '   ', '1/0', '1+', '(1+2', '1+2)', 'abc', '1;2', 'alert(1)', '1..2', '*3', '2**3', '1/(2-2)'])
    assert.equal(evalExpr(bad).ok, false, bad)
})

test('sumLines, calcDiff', () => {
  assert.equal(sumLines([72, 627]), 699)
  assert.equal(calcDiff(700, 699), 1)
  assert.equal(calcDiff(100, 100), 0)
  assert.equal(calcDiff(null, 5), -5)
  assert.equal(calcDiff(0.3, 0.1 + 0.2), 0)
})

test('ca DXS26: lấy 150 từ lô 12/10 (SL 200) -> còn 50; lô 13/10 (SL 100) còn 100; tổng không đổi', () => {
  const a = { qty: 200, picked: 150 }
  const b = { qty: 100, picked: 0 }
  assert.equal(lotRemaining(a.qty, a.picked), 50)
  assert.equal(lotRemaining(b.qty, b.picked), 100)
  assert.equal(lotRemaining(a.qty, a.picked) + lotRemaining(b.qty, b.picked), 300 - 150)
  assert.deepEqual(checkLotPick(200, 0, 150), { ok: true })
})

test('lấy 150 từ lô 100 bị chặn', () => {
  assert.deepEqual(checkLotPick(100, 0, 150), { ok: false, left: 100 })
  assert.deepEqual(checkLotPick(200, 150, 51), { ok: false, left: 50 })
  assert.deepEqual(checkLotPick(200, 150, 50), { ok: true })
  assert.deepEqual(checkLotPick(null, 0, 5), { ok: true })
})
