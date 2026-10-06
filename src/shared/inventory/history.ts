// Lịch sử kiểm tồn / lấy hàng. Phần đầu là hàm thuần (test được dưới node);
// phần CRUD import client/repo động vì client.ts tạo Web Worker khi import.
import { csvSafe } from '../../features/excel-formatter/formatter.ts'
import type { Cell } from '../excel/reader.ts'

export interface CountLine { seq: number; expr: string; value: number }

export interface CountSession {
  id: number
  sku: string
  description: string
  source: string
  location: string
  batch_no: string
  uom: string
  qty_system: number
  qty_counted: number
  diff: number
  counted_at: string
  note: string
}

export type CountInput = Omit<CountSession, 'id'> & { lines: { expr: string; value: number }[] }

export interface Pick {
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
}

export type PickInput = Omit<Pick, 'id'>

export interface HistoryFilter { sku?: string; from?: string; to?: string } // from/to: YYYY-MM-DD

// ---------- hàm thuần ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Giờ máy dạng 'YYYY-MM-DD HH:MM:SS' (cùng dạng sources.loaded_at). */
export function nowLocal(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Khoá khớp vị trí: (nguồn, vị trí, batch); null/rỗng coi như nhau. */
export const locKey = (source: string | null, location: string | null, batch: string | null) =>
  `${source ?? ''}\u0001${location ?? ''}\u0001${batch ?? ''}`

export interface PickLike { source: string | null; location: string | null; batch_no: string | null; qty: number | null; picked_at: string | null }

/**
 * Tổng "đã lấy" theo vị trí: chỉ tính picks có picked_at >= loaded_at của nguồn.
 * loadedAt: tên nguồn -> loaded_at. Nguồn không còn thì không tính.
 */
export function sumPicked(picks: PickLike[], loadedAt: Record<string, string>): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of picks) {
    const la = loadedAt[p.source ?? '']
    if (la === undefined || !p.picked_at || p.picked_at < la) continue
    const k = locKey(p.source, p.location, p.batch_no)
    out.set(k, (out.get(k) ?? 0) + (p.qty ?? 0))
  }
  return out
}

/** Tồn ước tính = tồn file - đã lấy (tồn rỗng coi là 0). */
export const estimateStock = (qtySystem: number | null | undefined, picked: number) => (qtySystem ?? 0) - picked

/** Điều kiện lọc ngày theo ngày địa phương: [from 00:00:00, to 23:59:59]. */
export function dateBounds(f: HistoryFilter): { from: string | null; to: string | null } {
  return { from: f.from ? `${f.from} 00:00:00` : null, to: f.to ? `${f.to} 23:59:59` : null }
}

export const COUNT_EXPORT_HEADER = ['Giờ kiểm', 'SKU', 'Mô tả', 'Nguồn', 'Vị trí', 'Batch', 'ĐVT', 'Tồn hệ thống', 'Tổng đếm', 'Lệch', 'Phép tính', 'Ghi chú']
export const PICK_EXPORT_HEADER = ['Giờ lấy', 'SKU', 'Mô tả', 'Nguồn', 'Vị trí', 'Batch', 'ĐVT', 'Số lượng', 'Số đơn', 'Ghi chú']

const safeRow = (cells: Cell[]): Cell[] => cells.map(csvSafe)

/** Dựng dòng xuất (Excel/CSV): mọi ô qua csvSafe; dòng đầu là tiêu đề. */
export function buildCountExport(sessions: CountSession[], lines: Record<number, CountLine[]> = {}): Cell[][] {
  return [
    COUNT_EXPORT_HEADER,
    ...sessions.map((s) =>
      safeRow([
        s.counted_at, s.sku, s.description, s.source, s.location, s.batch_no, s.uom,
        s.qty_system, s.qty_counted, s.diff,
        (lines[s.id] ?? []).map((l) => `${l.expr} = ${l.value}`).join('; '),
        s.note,
      ]),
    ),
  ]
}

export function buildPickExport(picks: Pick[]): Cell[][] {
  return [
    PICK_EXPORT_HEADER,
    ...picks.map((p) =>
      safeRow([p.picked_at, p.sku, p.description, p.source, p.location, p.batch_no, p.uom, p.qty, p.order_no ?? '', p.note]),
    ),
  ]
}

// ---------- CRUD (SQLite worker) ----------

async function db() {
  const [client, repo] = await Promise.all([import('../db/client.ts'), import('./repo.ts')])
  await repo.initSchema()
  return client
}

function where(col: string, f: HistoryFilter): { sql: string; bind: string[] } {
  const parts: string[] = []
  const bind: string[] = []
  const { from, to } = dateBounds(f)
  if (f.sku?.trim()) { parts.push('sku LIKE ?'); bind.push(`%${f.sku.trim()}%`) }
  if (from) { parts.push(`${col} >= ?`); bind.push(from) }
  if (to) { parts.push(`${col} <= ?`); bind.push(to) }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', bind }
}

const str = (v: unknown) => (v == null ? '' : String(v))

/** Lưu một lần kiểm (luôn tạo bản ghi mới); trả về id. */
export async function saveCount(c: CountInput): Promise<number> {
  if (c.lines.length === 0) throw new Error('Chưa có dòng phép tính nào')
  const { query, batch } = await db()
  await query(
    `INSERT INTO count_sessions (sku, description, source, location, batch_no, uom, qty_system, qty_counted, diff, counted_at, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [c.sku, c.description, c.source, c.location, c.batch_no, c.uom, c.qty_system, c.qty_counted, c.diff, c.counted_at || nowLocal(), c.note],
  )
  const [{ id }] = await query('SELECT last_insert_rowid() AS id')
  await batch(
    c.lines.map((l, i) => ({
      sql: 'INSERT INTO count_lines (session_id, seq, expr, value) VALUES (?,?,?,?)',
      bind: [id as number, i + 1, l.expr, l.value],
    })),
  )
  return id as number
}

export async function savePick(p: PickInput): Promise<number> {
  if (!(p.qty > 0)) throw new Error('Số lượng phải lớn hơn 0')
  const { query } = await db()
  await query(
    `INSERT INTO picks (sku, description, source, location, batch_no, uom, qty, order_no, picked_at, note)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [p.sku, p.description, p.source, p.location, p.batch_no, p.uom, p.qty, p.order_no?.trim() || null, p.picked_at || nowLocal(), p.note],
  )
  const [{ id }] = await query('SELECT last_insert_rowid() AS id')
  return id as number
}

export async function listCounts(f: HistoryFilter = {}): Promise<CountSession[]> {
  const { query } = await db()
  const w = where('counted_at', f)
  const rows = await query(`SELECT * FROM count_sessions ${w.sql} ORDER BY counted_at DESC, id DESC`, w.bind)
  return rows.map((r) => ({
    id: r.id as number, sku: str(r.sku), description: str(r.description), source: str(r.source),
    location: str(r.location), batch_no: str(r.batch_no), uom: str(r.uom),
    qty_system: (r.qty_system as number) ?? 0, qty_counted: (r.qty_counted as number) ?? 0, diff: (r.diff as number) ?? 0,
    counted_at: str(r.counted_at), note: str(r.note),
  }))
}

export async function getCountLines(sessionId: number): Promise<CountLine[]> {
  const { query } = await db()
  const rows = await query('SELECT seq, expr, value FROM count_lines WHERE session_id = ? ORDER BY seq', [sessionId])
  return rows.map((r) => ({ seq: r.seq as number, expr: str(r.expr), value: (r.value as number) ?? 0 }))
}

/** Dòng phép tính của nhiều phiên (phục vụ xuất file). */
export async function getLinesFor(sessionIds: number[]): Promise<Record<number, CountLine[]>> {
  const out: Record<number, CountLine[]> = {}
  for (const id of sessionIds) out[id] = await getCountLines(id)
  return out
}

export async function listPicks(f: HistoryFilter = {}): Promise<Pick[]> {
  const { query } = await db()
  const w = where('picked_at', f)
  const rows = await query(`SELECT * FROM picks ${w.sql} ORDER BY picked_at DESC, id DESC`, w.bind)
  return rows.map((r) => ({
    id: r.id as number, sku: str(r.sku), description: str(r.description), source: str(r.source),
    location: str(r.location), batch_no: str(r.batch_no), uom: str(r.uom), qty: (r.qty as number) ?? 0,
    order_no: r.order_no == null ? null : String(r.order_no), picked_at: str(r.picked_at), note: str(r.note),
  }))
}

/** Xoá một lần kiểm cùng các dòng phép tính của nó. */
export async function deleteCount(id: number) {
  const { batch } = await db()
  await batch([
    { sql: 'DELETE FROM count_lines WHERE session_id = ?', bind: [id] },
    { sql: 'DELETE FROM count_sessions WHERE id = ?', bind: [id] },
  ])
}

export async function deletePick(id: number) {
  const { query } = await db()
  await query('DELETE FROM picks WHERE id = ?', [id])
}

/** "Đã lấy" của một SKU theo vị trí (key = locKey), chỉ tính picks sau lần nạp file hiện tại. */
export async function getPickedBySku(sku: string): Promise<Map<string, number>> {
  const { query } = await db()
  const picks = (await query('SELECT source, location, batch_no, qty, picked_at FROM picks WHERE sku = ?', [sku])) as unknown as PickLike[]
  const srcs = await query('SELECT name, loaded_at FROM sources')
  const loadedAt = Object.fromEntries(srcs.map((s) => [s.name as string, (s.loaded_at as string) ?? '']))
  return sumPicked(picks, loadedAt)
}
