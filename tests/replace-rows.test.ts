import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countPeriodActivity, replaceRowsSql } from '../src/shared/inventory/lot-migrate.ts'

const src = { name: 'A', period: 2, loaded_at: '2026-10-10 08:00:00' }

test('countPeriodActivity chỉ đếm kỳ hiện tại của đúng nguồn', () => {
  const picks = [
    { source: 'A', period: 2, picked_at: '2026-10-11 09:00:00' },
    { source: 'A', period: null, picked_at: '2026-10-12 09:00:00' },
    { source: 'A', period: 1, picked_at: '2026-10-11 09:00:00' }, // kỳ cũ
    { source: 'A', period: 2, picked_at: '2026-10-09 09:00:00' }, // trước lần nạp
    { source: 'B', period: 2, picked_at: '2026-10-11 09:00:00' },
  ]
  const edits = [{ source: 'A', at: '2026-10-11 10:00:00' }, { source: 'A', at: '2026-10-01 10:00:00' }, { source: 'B', at: '2026-10-11 10:00:00' }]
  assert.deepEqual(countPeriodActivity(src, picks, edits), { picks: 2, edits: 1 })
})

test('replaceRowsSql: tăng kỳ, lot_id mới cho từng dòng, cùng một batch', () => {
  const st = replaceRowsSql(7, ['sku', 'qty'], [['S1', 1], ['S2', 2]], { file_name: 'f.xlsx', skipped: '' })
  assert.match(st[0].sql, /^DELETE FROM inventory_rows/)
  assert.equal(st.filter((s) => s.sql.startsWith('UPDATE lot_counter')).length, 2)
  const ins = st.filter((s) => s.sql.startsWith('INSERT INTO inventory_rows'))
  assert.equal(ins.length, 2)
  assert.match(ins[0].sql, /\(SELECT n FROM lot_counter WHERE id = 1\)/)
  assert.deepEqual(ins[1].bind, [7, 'S2', 2])
  // counter tăng ngay trước mỗi INSERT
  assert.ok(st[1].sql.startsWith('UPDATE lot_counter') && st[2].sql.startsWith('INSERT'))
  const last = st[st.length - 1]
  assert.match(last.sql, /period = CASE WHEN loaded_at IS NULL OR loaded_at = '' THEN period ELSE period \+ 1 END/)
  assert.ok(!st.some((s) => /DELETE FROM (picks|inventory_edits)/.test(s.sql)))
})
