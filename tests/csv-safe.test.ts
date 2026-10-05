import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { csvSafe } from '../src/features/excel-formatter/formatter.ts'

test('csvSafe: thêm dấu \' trước chuỗi nguy hiểm, giữ nguyên trường hợp khác', () => {
  const cases: [Parameters<typeof csvSafe>[0], ReturnType<typeof csvSafe>][] = [
    ['=1+1', "'=1+1"],
    ['+84', "'+84"],
    ['-x', "'-x"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tA', "'\tA"],
    ['\rA', "'\rA"],
    ['ABC', 'ABC'],
    ['', ''],
    [-5, -5],
    [3.2, 3.2],
    [null, null],
  ]
  for (const [input, expected] of cases) assert.equal(csvSafe(input), expected, JSON.stringify(input))
})

// Tách một dòng CSV thành các trường, bỏ dấu ngoặc kép bao ngoài.
function fields(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

test('Xuất CSV: tiêu đề và ô qua csvSafe không còn trường bắt đầu bằng = + - @', () => {
  const headers = ['=H', 'SL', 'Tên']
  const rows = [['=HYPERLINK("http://x")', -5, 'ABC']]
  const ws = XLSX.utils.aoa_to_sheet([headers.map(csvSafe), ...rows.map((r) => r.map(csvSafe))])
  const lines = XLSX.utils.sheet_to_csv(ws).split('\n').filter(Boolean)
  assert.equal(lines.length, 2)
  const all = lines.flatMap(fields)
  // Ngoại lệ duy nhất: ô kiểu số (VD -5) — Excel không coi là công thức.
  for (const f of all.filter((f) => !/^-?\d+(\.\d+)?$/.test(f))) assert.doesNotMatch(f, /^[=+\-@]/, f)
  assert.deepEqual(fields(lines[0]), ["'=H", 'SL', 'Tên'])
  assert.deepEqual(fields(lines[1]), ['\'=HYPERLINK("http://x")', '-5', 'ABC'])
  // Ô số -5 vẫn là kiểu số trong sheet
  assert.equal(ws.B2.t, 'n')
})
