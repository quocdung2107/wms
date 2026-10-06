import { batch, dbReady, query } from '../db/client.ts'
import { STD_FIELDS, type StdField, type StdRow } from '../excel/reader.ts'
import type { InvRow } from './sheet.ts'
import { DEFAULT_UOM } from './uom.ts'

export type SavedMapping = Partial<Record<StdField, string>> // trường chuẩn → nhãn cột

export interface Source {
  id: number
  name: string
  sheet: string
  header_row: number
  header_rows: number
  mapping: SavedMapping
  file_name: string
  loaded_at: string
  row_count: number
  skipped: string
}

export interface SourceInput {
  name: string
  sheet: string
  header_row: number
  header_rows: number
  mapping: SavedMapping
}

let schemaReady: Promise<unknown> | null = null

/** Gọi trước mọi truy vấn; chỉ chạy một lần. */
export function initSchema() {
  schemaReady ??= (async () => {
    await dbReady
    await batch([
      { sql: 'CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sheet TEXT, header_row INTEGER, header_rows INTEGER, mapping TEXT, file_name TEXT, loaded_at TEXT, row_count INTEGER DEFAULT 0, skipped TEXT)' },
      { sql: `CREATE TABLE IF NOT EXISTS inventory_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, ${STD_FIELDS.map((f) => `${f} ${f.startsWith('qty_') ? 'REAL' : 'TEXT'}`).join(', ')})` },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_inv_source ON inventory_rows(source_id)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory_rows(sku)' },
      { sql: 'CREATE TABLE IF NOT EXISTS uom_map (key TEXT PRIMARY KEY, label TEXT NOT NULL)' },
      // Lịch sử kiểm/lấy hàng: lưu sao chụp (không khoá ngoại), sống sót khi nạp lại file.
      { sql: 'CREATE TABLE IF NOT EXISTS count_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, description TEXT, source TEXT, location TEXT, batch_no TEXT, uom TEXT, qty_system REAL, qty_counted REAL, diff REAL, counted_at TEXT, note TEXT)' },
      { sql: 'CREATE TABLE IF NOT EXISTS count_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, seq INTEGER, expr TEXT, value REAL)' },
      { sql: 'CREATE TABLE IF NOT EXISTS picks (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, description TEXT, source TEXT, location TEXT, batch_no TEXT, uom TEXT, qty REAL, order_no TEXT, picked_at TEXT, note TEXT)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_count_sku ON count_sessions(sku)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_count_at ON count_sessions(counted_at)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_count_lines_session ON count_lines(session_id)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_picks_sku ON picks(sku)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_picks_at ON picks(picked_at)' },
    ])
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM uom_map')
    if (n === 0) await batch(Object.entries(DEFAULT_UOM).map(([k, v]) => ({ sql: 'INSERT INTO uom_map VALUES (?, ?)', bind: [k, v] })))
  })()
  return schemaReady
}

const toSource = (r: Record<string, unknown>): Source => ({
  id: r.id as number,
  name: r.name as string,
  sheet: (r.sheet as string) ?? '',
  header_row: (r.header_row as number) ?? 0,
  header_rows: (r.header_rows as number) ?? 1,
  mapping: JSON.parse((r.mapping as string) || '{}'),
  file_name: (r.file_name as string) ?? '',
  loaded_at: (r.loaded_at as string) ?? '',
  row_count: (r.row_count as number) ?? 0,
  skipped: (r.skipped as string) ?? '',
})

export async function listSources(): Promise<Source[]> {
  await initSchema()
  return (await query('SELECT * FROM sources ORDER BY name')).map(toSource)
}

/** Tạo hoặc cập nhật hồ sơ nguồn (khoá theo tên); trả về id. */
export async function saveSource(s: SourceInput): Promise<number> {
  await initSchema()
  await query(
    `INSERT INTO sources (name, sheet, header_row, header_rows, mapping) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET sheet = excluded.sheet, header_row = excluded.header_row,
       header_rows = excluded.header_rows, mapping = excluded.mapping`,
    [s.name, s.sheet, s.header_row, s.header_rows, JSON.stringify(s.mapping)],
  )
  const [row] = await query('SELECT id FROM sources WHERE name = ?', [s.name])
  return row.id as number
}

/** Nạp file mới thay hoàn toàn dữ liệu cũ của cùng nguồn (không giữ lịch sử). */
export async function replaceRows(sourceId: number, rows: StdRow[], meta: { file_name: string; skipped: string }) {
  await initSchema()
  const cols = ['source_id', ...STD_FIELDS]
  const insert = `INSERT INTO inventory_rows (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  await batch([
    { sql: 'DELETE FROM inventory_rows WHERE source_id = ?', bind: [sourceId] },
    ...rows.map((r) => ({ sql: insert, bind: [sourceId, ...STD_FIELDS.map((f) => r[f])] })),
    {
      sql: `UPDATE sources SET file_name = ?, skipped = ?, row_count = ?, loaded_at = datetime('now', 'localtime') WHERE id = ?`,
      bind: [meta.file_name, meta.skipped, rows.length, sourceId],
    },
  ])
}

export async function deleteSource(id: number) {
  await initSchema()
  await batch([
    { sql: 'DELETE FROM inventory_rows WHERE source_id = ?', bind: [id] },
    { sql: 'DELETE FROM sources WHERE id = ?', bind: [id] },
  ])
}

export async function getRows(sourceId: number): Promise<InvRow[]> {
  await initSchema()
  return (await query('SELECT * FROM inventory_rows WHERE source_id = ?', [sourceId])) as unknown as InvRow[]
}

export type SkuHit = { sku: string; description: string }

/** Gợi ý khi gõ SKU: khớp đầu mã trước, rồi khớp chứa mã/tên hàng. */
export async function searchSkus(term: string, limit = 8): Promise<SkuHit[]> {
  await initSchema()
  const t = term.trim()
  if (!t) return []
  const esc = t.replace(/[!%_]/g, '!$&')
  return (await query(
    `SELECT sku, MIN(description) AS description FROM inventory_rows
     WHERE sku LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!'
     GROUP BY sku
     ORDER BY (sku LIKE ? ESCAPE '!') DESC, sku LIMIT ?`,
    [`%${esc}%`, `%${esc}%`, `${esc}%`, limit],
  )) as SkuHit[]
}

export type SkuRow = InvRow & { source: string }

export async function getRowsBySku(sku: string): Promise<SkuRow[]> {
  await initSchema()
  return (await query(
    `SELECT r.*, s.name AS source FROM inventory_rows r JOIN sources s ON s.id = r.source_id
     WHERE r.sku = ? ORDER BY s.name, r.location, r.batch_no`,
    [sku],
  )) as unknown as SkuRow[]
}

// ---------- ĐVT ----------

export async function getUomMap(): Promise<Record<string, string>> {
  await initSchema()
  const rows = await query('SELECT key, label FROM uom_map')
  return Object.fromEntries(rows.map((r) => [r.key as string, r.label as string]))
}

export async function setUom(key: string, label: string) {
  await initSchema()
  await query('INSERT INTO uom_map (key, label) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET label = excluded.label', [key, label])
}

export async function deleteUom(key: string) {
  await initSchema()
  await query('DELETE FROM uom_map WHERE key = ?', [key])
}

export async function distinctUomRaw(): Promise<string[]> {
  await initSchema()
  return (await query(`SELECT DISTINCT uom_raw FROM inventory_rows WHERE uom_raw <> ''`)).map((r) => r.uom_raw as string)
}
