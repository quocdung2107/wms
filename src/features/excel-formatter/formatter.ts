// Excel Formatter: chuỗi bước biến đổi bảng (hàm thuần, test được).
import type { Cell, TableData } from '../../shared/excel/reader.ts'

export type FilterOp = 'contains' | 'notcontains' | 'eq' | 'neq' | 'gt' | 'ge' | 'lt' | 'le' | 'empty' | 'nonempty'

export type Step =
  | { type: 'rename'; col: string; name: string }
  | { type: 'delete'; cols: string[] }
  | { type: 'move'; col: string; dir: 'left' | 'right' }
  | { type: 'filter'; col: string; op: FilterOp; value: string }
  | { type: 'sort'; col: string; dir: 'asc' | 'desc' }
  | { type: 'group'; by: string[]; sum: string[] }
  | { type: 'split'; col: string; delimiter: string }
  | { type: 'merge'; cols: string[]; sep: string; name: string }

export const OP_LABELS: Record<FilterOp, string> = {
  contains: 'chứa',
  notcontains: 'không chứa',
  eq: 'bằng',
  neq: 'khác',
  gt: 'lớn hơn',
  ge: 'lớn hơn hoặc bằng',
  lt: 'nhỏ hơn',
  le: 'nhỏ hơn hoặc bằng',
  empty: 'để trống',
  nonempty: 'không trống',
}

const text = (v: Cell) => (v === null ? '' : String(v))
const num = (v: Cell): number | null => {
  if (typeof v === 'number') return v
  if (v === null || v.trim() === '') return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function describe(s: Step): string {
  switch (s.type) {
    case 'rename': return `Đổi tên "${s.col}" → "${s.name}"`
    case 'delete': return `Xoá cột: ${s.cols.join(', ')}`
    case 'move': return `Dời cột "${s.col}" sang ${s.dir === 'left' ? 'trái' : 'phải'}`
    case 'filter': return `Giữ dòng có "${s.col}" ${OP_LABELS[s.op]}${s.op === 'empty' || s.op === 'nonempty' ? '' : ` "${s.value}"`}`
    case 'sort': return `Sắp xếp theo "${s.col}" ${s.dir === 'asc' ? 'tăng' : 'giảm'}`
    case 'group': return `Nhóm theo ${s.by.join(', ')}${s.sum.length ? `, cộng ${s.sum.join(', ')}` : ''}`
    case 'split': return `Tách "${s.col}" theo "${s.delimiter}"`
    case 'merge': return `Gộp ${s.cols.join(' + ')} → "${s.name}"`
  }
}

function uniqueName(name: string, existing: string[]) {
  let n = name
  for (let i = 2; existing.includes(n); i++) n = `${name} (${i})`
  return n
}

function matches(v: Cell, op: FilterOp, value: string): boolean {
  const a = text(v).toLowerCase()
  const b = value.toLowerCase()
  switch (op) {
    case 'contains': return a.includes(b)
    case 'notcontains': return !a.includes(b)
    case 'empty': return a.trim() === ''
    case 'nonempty': return a.trim() !== ''
    case 'eq':
    case 'neq': {
      const x = num(v)
      const y = num(value)
      const same = x !== null && y !== null ? x === y : a === b
      return op === 'eq' ? same : !same
    }
    default: {
      const x = num(v)
      const y = num(value)
      if (x === null || y === null) return false
      return op === 'gt' ? x > y : op === 'ge' ? x >= y : op === 'lt' ? x < y : x <= y
    }
  }
}

/** Áp một bước; trả null nếu bước tham chiếu cột không còn tồn tại. */
export function applyStep(t: TableData, s: Step): TableData | null {
  const idx = (c: string) => t.headers.indexOf(c)
  const all = (cols: string[]) => cols.every((c) => idx(c) >= 0)
  switch (s.type) {
    case 'rename': {
      const i = idx(s.col)
      if (i < 0 || !s.name.trim()) return null
      const headers = [...t.headers]
      headers[i] = uniqueName(s.name.trim(), t.headers.filter((_, k) => k !== i))
      return { headers, rows: t.rows }
    }
    case 'delete': {
      if (!all(s.cols)) return null
      const keep = t.headers.map((h, i) => (s.cols.includes(h) ? -1 : i)).filter((i) => i >= 0)
      return { headers: keep.map((i) => t.headers[i]), rows: t.rows.map((r) => keep.map((i) => r[i])) }
    }
    case 'move': {
      const i = idx(s.col)
      const j = s.dir === 'left' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= t.headers.length) return t
      const order = t.headers.map((_, k) => k)
      ;[order[i], order[j]] = [order[j], order[i]]
      return { headers: order.map((k) => t.headers[k]), rows: t.rows.map((r) => order.map((k) => r[k])) }
    }
    case 'filter': {
      const i = idx(s.col)
      if (i < 0) return null
      return { headers: t.headers, rows: t.rows.filter((r) => matches(r[i], s.op, s.value)) }
    }
    case 'sort': {
      const i = idx(s.col)
      if (i < 0) return null
      const k = s.dir === 'asc' ? 1 : -1
      const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })
      const rows = [...t.rows].sort((a, b) => {
        const x = num(a[i])
        const y = num(b[i])
        if (x !== null && y !== null) return (x - y) * k
        if (a[i] === null || a[i] === '') return b[i] === null || b[i] === '' ? 0 : 1 // trống xuống cuối
        if (b[i] === null || b[i] === '') return -1
        return collator.compare(text(a[i]), text(b[i])) * k
      })
      return { headers: t.headers, rows }
    }
    case 'group': {
      if (!all(s.by) || !all(s.sum) || s.by.length === 0) return null
      const by = s.by.map(idx)
      const sum = s.sum.map(idx)
      const groups = new Map<string, { key: Cell[]; count: number; sums: number[] }>()
      for (const r of t.rows) {
        const key = by.map((i) => r[i])
        const id = JSON.stringify(key)
        let g = groups.get(id)
        if (!g) groups.set(id, (g = { key, count: 0, sums: sum.map(() => 0) }))
        g.count++
        sum.forEach((i, n) => (g.sums[n] += num(r[i]) ?? 0))
      }
      const countName = uniqueName('Số dòng', s.by)
      return {
        headers: [...s.by, countName, ...s.sum.map((c) => uniqueName(`Tổng ${c}`, [...s.by, countName]))],
        rows: [...groups.values()].map((g) => [...g.key, g.count, ...g.sums.map((x) => Math.round(x * 1e6) / 1e6)]),
      }
    }
    case 'split': {
      const i = idx(s.col)
      if (i < 0 || s.delimiter === '') return null
      const parts = t.rows.map((r) => text(r[i]).split(s.delimiter).map((p) => p.trim()))
      const n = Math.min(10, Math.max(1, ...parts.map((p) => p.length)))
      const names: string[] = []
      for (let k = 1; k <= n; k++) names.push(uniqueName(`${s.col} ${k}`, [...t.headers, ...names]))
      return {
        headers: [...t.headers, ...names],
        rows: t.rows.map((r, ri) => [...r, ...names.map((_, k) => parts[ri][k] ?? null)]),
      }
    }
    case 'merge': {
      if (!all(s.cols) || s.cols.length < 2 || !s.name.trim()) return null
      const ix = s.cols.map(idx)
      return {
        headers: [...t.headers, uniqueName(s.name.trim(), t.headers)],
        rows: t.rows.map((r) => [...r, ix.map((i) => text(r[i])).filter((x) => x !== '').join(s.sep)]),
      }
    }
  }
}

export function applySteps(t: TableData, steps: Step[]): { table: TableData; failed: number[] } {
  let cur = t
  const failed: number[] = []
  steps.forEach((s, i) => {
    const next = applyStep(cur, s)
    if (next) cur = next
    else failed.push(i)
  })
  return { table: cur, failed }
}
