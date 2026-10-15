// Nâng cấp SQLite lên mô hình lô (lot_id) + kỳ (period). Toàn bộ là hàm thuần để test;
// repo.ts đọc dữ liệu, gọi planLotMigration rồi chạy các lệnh trong MỘT batch (giao dịch).

export interface LotRow {
  id: number
  sku: string
  source: string // tên nguồn (sources.name)
  location: string
  batch_no: string
  manuf_date: string
  qty_system: number
  lot_id: number | null
}

export interface LotPick {
  id: number
  sku: string
  description: string
  source: string
  location: string
  batch_no: string
  uom: string
  qty: number
  order_no: string | null
  picked_at: string
  note: string
  pick_order_id: number | null
  lot_id: number | null
  period: number | null // null = chưa chuyển đổi
}

export type Stmt = { sql: string; bind?: (string | number | null)[] }

/** ALTER/CREATE còn thiếu. `cols` = tên cột lấy từ PRAGMA table_info của từng bảng (rỗng nếu chưa có). */
export function lotUpgradeSql(cols: {
  inventory_rows: string[]
  picks: string[]
  sources: string[]
  pick_order_lines: string[]
}): string[] {
  const out: string[] = []
  const add = (table: keyof typeof cols, col: string, type: string) => {
    if (!cols[table].includes(col)) out.push(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
  }
  add('inventory_rows', 'lot_id', 'INTEGER')
  add('picks', 'lot_id', 'INTEGER')
  add('picks', 'period', 'INTEGER')
  add('picks', 'needs_review', 'INTEGER NOT NULL DEFAULT 0')
  add('sources', 'period', 'INTEGER NOT NULL DEFAULT 1')
  add('pick_order_lines', 'batch_no', 'TEXT')
  add('pick_order_lines', 'manuf_date', 'TEXT')
  out.push('CREATE TABLE IF NOT EXISTS lot_counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL)')
  out.push('INSERT OR IGNORE INTO lot_counter (id, n) VALUES (1, 0)')
  out.push('CREATE INDEX IF NOT EXISTS idx_inv_lot ON inventory_rows(lot_id)')
  out.push('CREATE INDEX IF NOT EXISTS idx_picks_lot ON picks(lot_id)')
  return out
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const keyOf = (r: { sku: string; source: string; location: string; batch_no: string }) =>
  [norm(r.sku), norm(r.source), norm(r.location), norm(r.batch_no)].join('\u0001')

/** Ngày SX rỗng/không hợp lệ xếp cuối (coi như mới nhất). So sánh chuỗi ISO yyyy-mm-dd. */
const dateRank = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d.trim()) ? d.trim() : '￿')

export interface MigrationInput {
  rows: LotRow[]
  picks: LotPick[]
  counter: number // lot_counter.n hiện tại
  loadedAt: Record<string, string> // tên nguồn -> sources.loaded_at ('' nếu chưa rõ)
  currentPeriod: Record<string, number> // tên nguồn -> sources.period
}

export interface MigrationPlan {
  counter: number
  assigned: { rowId: number; lotId: number }[]
  statements: Stmt[]
  /** Thống kê để test/ghi log. */
  stats: { rowsAssigned: number; picksUpdated: number; picksInserted: number; period0: number; unknownLot: number; needsReview: number }
}

/**
 * Lập kế hoạch: (1) cấp lot_id cho dòng tồn chưa có (tăng lot_counter, không tái dùng);
 * (2) chuyển đổi pick chưa chuyển (period IS NULL). Chạy lại trên dữ liệu đã chuyển -> kế hoạch rỗng.
 */
export function planLotMigration(input: MigrationInput): MigrationPlan {
  let counter = input.counter
  const stmts: Stmt[] = []
  const stats = { rowsAssigned: 0, picksUpdated: 0, picksInserted: 0, period0: 0, unknownLot: 0, needsReview: 0 }
  const assigned: { rowId: number; lotId: number }[] = []

  const lotOf = new Map<number, number>()
  for (const r of [...input.rows].sort((a, b) => a.id - b.id)) {
    if (r.lot_id == null) {
      counter++
      lotOf.set(r.id, counter)
      assigned.push({ rowId: r.id, lotId: counter })
      stmts.push({ sql: 'UPDATE inventory_rows SET lot_id = ? WHERE id = ? AND lot_id IS NULL', bind: [counter, r.id] })
      stats.rowsAssigned++
    } else lotOf.set(r.id, r.lot_id)
  }
  if (assigned.length) stmts.push({ sql: 'UPDATE lot_counter SET n = ? WHERE id = 1', bind: [counter] })

  // Nhóm dòng theo khoá (sku, nguồn, vị trí, batch); mỗi nhóm sắp theo Ngày SX cũ trước.
  const groups = new Map<string, LotRow[]>()
  for (const r of input.rows) {
    const k = keyOf(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  for (const g of groups.values()) g.sort((a, b) => dateRank(a.manuf_date).localeCompare(dateRank(b.manuf_date)) || a.id - b.id)

  const used = new Map<number, number>() // rowId -> SL đã phân bổ
  const todo = input.picks
    .filter((p) => p.period == null && p.lot_id == null)
    .sort((a, b) => (a.picked_at < b.picked_at ? -1 : a.picked_at > b.picked_at ? 1 : a.id - b.id))

  const setPick = (id: number, lot: number | null, period: number, qty: number | null, review: number): Stmt => ({
    sql: 'UPDATE picks SET lot_id = ?, period = ?, needs_review = ?, qty = COALESCE(?, qty) WHERE id = ?',
    bind: [lot, period, review, qty, id],
  })
  const insertPick = (p: LotPick, lot: number | null, period: number, qty: number, review: number): Stmt => ({
    sql: `INSERT INTO picks (sku, description, source, location, batch_no, uom, qty, order_no, picked_at, note, pick_order_id, lot_id, period, needs_review)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [p.sku, p.description, p.source, p.location, p.batch_no, p.uom, qty, p.order_no, p.picked_at, p.note, p.pick_order_id, lot, period, review],
  })

  for (const p of todo) {
    const cur = input.currentPeriod[p.source] ?? 1
    const loaded = input.loadedAt[p.source] ?? ''
    // Lấy trước lần nạp file hiện tại -> thuộc kỳ trước, không tính.
    if (loaded && p.picked_at && p.picked_at < loaded) {
      stmts.push(setPick(p.id, null, 0, null, 0))
      stats.period0++
      stats.picksUpdated++
      continue
    }
    const cands = groups.get(keyOf(p)) ?? []
    if (cands.length === 0) {
      stmts.push(setPick(p.id, null, cur, null, 0))
      stats.unknownLot++
      stats.picksUpdated++
    } else if (cands.length === 1) {
      const r = cands[0]
      used.set(r.id, (used.get(r.id) ?? 0) + p.qty)
      stmts.push(setPick(p.id, lotOf.get(r.id) ?? null, cur, null, 0))
      stats.picksUpdated++
    } else {
      // >= 2 dòng: FIFO theo Ngày SX cũ trước, mỗi lô tối đa SL còn lại; phần dư không lô.
      let left = p.qty
      const parts: { lot: number | null; qty: number }[] = []
      for (const r of cands) {
        if (left <= 0) break
        const free = Math.max(0, (r.qty_system || 0) - (used.get(r.id) ?? 0))
        const take = Math.min(free, left)
        if (take <= 0) continue
        used.set(r.id, (used.get(r.id) ?? 0) + take)
        parts.push({ lot: lotOf.get(r.id) ?? null, qty: take })
        left -= take
      }
      if (left > 1e-9 || parts.length === 0) parts.push({ lot: null, qty: left > 0 ? left : p.qty })
      stmts.push(setPick(p.id, parts[0].lot, cur, parts[0].qty, 1))
      stats.picksUpdated++
      stats.needsReview++
      for (const part of parts.slice(1)) {
        stmts.push(insertPick(p, part.lot, cur, part.qty, 1))
        stats.picksInserted++
        stats.needsReview++
      }
    }
  }
  return { counter, assigned, statements: stmts, stats }
}
