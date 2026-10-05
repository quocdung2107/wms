import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildColumns, detectHeader, extractRows, extractTable, readWorkbook, suggestMapping,
  type SheetData,
} from '../src/shared/excel/reader.ts'

const SAMPLES = new URL('../../samples/', import.meta.url)
const load = (f: string) => readWorkbook(readFileSync(new URL(f, SAMPLES)))

function std(sheet: SheetData) {
  const info = detectHeader(sheet.matrix)
  const cols = buildColumns(sheet, info)
  const mapping = suggestMapping(cols)
  return { info, cols, mapping, ...extractRows(sheet, info, mapping) }
}

test('MISA: tiêu đề 2 tầng, 217 dòng, bỏ dòng Tổng cộng', () => {
  const [sheet] = load('inventory_to Misa.xlsx')
  const r = std(sheet)
  assert.deepEqual(r.info, { headerRow: 3, headerRows: 2 })
  assert.equal(r.rows.length, 217)
  assert.equal(r.skippedTotal, 1)
  assert.equal(r.mapping.sku, 2)
  assert.equal(r.cols[r.mapping.qty_system!].label, 'Số lượng cuối kỳ')
  assert.ok(r.rows.some((x) => x.qty_system === -24))
  assert.ok(r.rows.some((x) => x.qty_system !== null && !Number.isInteger(x.qty_system)))
  assert.ok(r.rows.every((x) => x.sku !== '' && x.warehouse !== ''))
})

test('KLN: 233 dòng, bỏ #N/A, 9 DAMAGED, Batch giữ số 0 đầu, Volume là cột công thức', () => {
  const sheet = load('inventory_to WMS KLN.xlsx').find((s) => s.name === 'Inventory Report')!
  const r = std(sheet)
  assert.deepEqual(r.info, { headerRow: 0, headerRows: 1 })
  assert.equal(r.rows.length, 233)
  assert.equal(r.rows.filter((x) => x.condition === 'DAMAGED').length, 9)
  assert.ok(r.rows.some((x) => /^0\d/.test(x.batch_no)))
  assert.ok(r.rows.every((x) => typeof x.lot_no === 'string' && x.lot_no.length === 14))
  assert.equal(r.cols.find((c) => c.label === 'Volume')!.formula, true)
  assert.ok(!Object.values(r.mapping).includes(r.cols.findIndex((c) => c.label === 'Volume')))
  assert.match(r.rows[0].receive_date, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(r.rows[0].location, 'DS-C01-2')
})

test('Excel Formatter: bảng KLN bỏ cột trống', () => {
  const sheet = load('inventory_to WMS KLN.xlsx')[0]
  const t = extractTable(sheet, detectHeader(sheet.matrix))
  assert.equal(t.rows.length, 233)
  assert.ok(t.headers.length < 50 && !t.headers.includes('Zone'))
})

import { buildSheet, countLines, DEFAULT_OPTIONS, naturalCompare, rackGroup, type InvRow } from '../src/shared/inventory/sheet.ts'
import { makeUomLabeler, DEFAULT_UOM } from '../src/shared/inventory/uom.ts'

test('Phiếu kiểm KLN: chia theo dãy kệ, sắp tự nhiên, gộp trùng', () => {
  const sheet = load('inventory_to WMS KLN.xlsx')[0]
  const rows = std(sheet).rows.map((r, i) => ({ ...r, id: i, source_id: 1 })) as InvRow[]
  const uom = makeUomLabeler(DEFAULT_UOM)
  const lots = buildSheet(rows, { ...DEFAULT_OPTIONS, merge: false }, uom)
  const merged = buildSheet(rows, DEFAULT_OPTIONS, uom)
  assert.equal(countLines(lots), 233)
  assert.ok(countLines(merged) < 233)
  console.log('gộp:', 233, '->', countLines(merged), 'dòng;', merged.length, 'dãy kệ:', merged.map((g) => g.name).join(' '))
  assert.ok(merged.every((g) => g.lines.every((l) => rackGroup(l.location) === g.name)))
  const locs = merged.flatMap((g) => g.lines.map((l) => l.location))
  assert.deepEqual(locs, [...locs].sort(naturalCompare))
  const total = (g: typeof lots) => g.flatMap((x) => x.lines).reduce((s, l) => s + (l.qty_system ?? 0), 0)
  assert.equal(total(lots), total(merged))
  assert.ok(naturalCompare('DS-A02-1', 'DS-A10-1') < 0)
})

test('ĐVT: CAI = CÁI = Cái = Chiếc', () => {
  const f = makeUomLabeler(DEFAULT_UOM)
  assert.deepEqual(['CAI', 'CÁI', 'Cái', 'Chiếc'].map(f), ['Cái', 'Cái', 'Cái', 'Cái'])
  assert.equal(f('CTN'), 'CTN')
})

import { applySteps } from '../src/features/excel-formatter/formatter.ts'

test('Excel Formatter: lọc, nhóm, tách, gộp, đổi tên, sắp xếp', () => {
  const sheet = load('inventory_to WMS KLN.xlsx')[0]
  const t = extractTable(sheet, detectHeader(sheet.matrix))
  const f = applySteps(t, [
    { type: 'filter', col: 'Condition', op: 'eq', value: 'DAMAGED' },
    { type: 'rename', col: 'OnHand Qty', name: 'SL' },
  ])
  assert.equal(f.table.rows.length, 9)
  assert.ok(f.table.headers.includes('SL'))
  const g = applySteps(t, [{ type: 'group', by: ['SKU'], sum: ['OnHand Qty'] }])
  assert.deepEqual(g.table.headers, ['SKU', 'Số dòng', 'Tổng OnHand Qty'])
  assert.equal(g.table.rows.reduce((s, r) => s + (r[1] as number), 0), 233)
  const m = applySteps(t, [{ type: 'merge', cols: ['Warehouse', 'Location'], sep: ' / ', name: 'WL' }])
  assert.match(String(m.table.rows[0][m.table.headers.indexOf('WL')]), / \/ DS-C01-2$/)
  const sp = applySteps(t, [{ type: 'split', col: 'Location', delimiter: '-' }])
  assert.equal(sp.table.rows[0][sp.table.headers.indexOf('Location 3')], '2')
  const so = applySteps(t, [{ type: 'sort', col: 'OnHand Qty', dir: 'desc' }])
  const q = so.table.headers.indexOf('OnHand Qty')
  assert.ok((so.table.rows[0][q] as number) >= (so.table.rows[1][q] as number))
  assert.deepEqual(applySteps(t, [{ type: 'delete', cols: ['Nope'] }]).failed, [0])
})
