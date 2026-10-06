import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalExpr, sumLines, calcDiff } from '../src/features/sku-lookup/calc.ts'

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
