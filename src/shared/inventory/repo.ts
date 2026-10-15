import { batch, dbReady, query } from '../db/client.ts'
import { STD_FIELDS, type StdField, type StdRow } from '../excel/reader.ts'
import type { InvRow } from './sheet.ts'
import type { WeightRow } from './weight.ts'
import { DEFAULT_UOM } from './uom.ts'
import { CUSTOMER_FIELDS, customerKey, normalizeCustomer, validateCustomer, type Customer } from './customers.ts'
import type { EditLog, EditOp, EditPlan } from './edit.ts'
import { pickOrdersUpgradeSql, picksUpgradeSql } from '../../features/pick-orders/logic.ts'
import type { ReceivePlan } from './receive.ts'
import { countPeriodActivity, lotUpgradeSql, planLotMigration, replaceRowsSql } from './lot-migrate.ts'

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
  period: number
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
      // Đơn picking cục bộ (PK-xxxx). Bộ đếm riêng: mã không bị tái dùng sau khi xoá đơn.
      { sql: `CREATE TABLE IF NOT EXISTS pick_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT, status TEXT NOT NULL DEFAULT 'open', order_ref TEXT, created_at TEXT, allow_sku_tag INTEGER NOT NULL DEFAULT 0)` },
      { sql: 'CREATE TABLE IF NOT EXISTS pick_order_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, pick_order_id INTEGER NOT NULL, sku TEXT NOT NULL, description TEXT, uom TEXT, qty_need REAL NOT NULL)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_pol_order ON pick_order_lines(pick_order_id)' },
      { sql: 'CREATE TABLE IF NOT EXISTS pick_counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL)' },
      { sql: 'INSERT OR IGNORE INTO pick_counter (id, n) VALUES (1, 0)' },
      // Khối lượng kg/ĐVT theo SKU. Bảng riêng: nạp lại tồn kho không đụng tới.
      { sql: 'CREATE TABLE IF NOT EXISTS sku_weight (sku_key TEXT PRIMARY KEY, sku TEXT NOT NULL, weight_kg REAL NOT NULL)' },
      // Khách hàng. pick_orders.customer_code chỉ là chữ thường, không khoá ngoại (xoá khách không ảnh hưởng PK).
      { sql: 'CREATE TABLE IF NOT EXISTS customers (code_key TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, short_name TEXT, address TEXT, delivery_address TEXT, contact TEXT, sup TEXT, phone1 TEXT, phone2 TEXT, note TEXT)' },
      // Nhật ký sửa/di chuyển/tách/gộp dòng tồn (before/after: JSON). Không khoá ngoại, sống sót khi nạp lại file.
      { sql: 'CREATE TABLE IF NOT EXISTS inventory_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, sku TEXT, source TEXT, before TEXT, after TEXT)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_inv_edits_at ON inventory_edits(at)' },
    ])
    // DB cũ: picks chưa có cột pick_order_id -> thêm (không mất dữ liệu cũ).
    const cols = (await query('PRAGMA table_info(picks)')).map((c) => String(c.name))
    await batch(picksUpgradeSql(cols).map((sql) => ({ sql })))
    const poCols = (await query('PRAGMA table_info(pick_orders)')).map((c) => String(c.name))
    const poSql = pickOrdersUpgradeSql(poCols)
    if (poSql.length) await batch(poSql.map((sql) => ({ sql })))
    await migrateLots()
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM uom_map')
    if (n === 0) await batch(Object.entries(DEFAULT_UOM).map(([k, v]) => ({ sql: 'INSERT INTO uom_map VALUES (?, ?)', bind: [k, v] })))
  })()
  return schemaReady
}

/** Thêm cột/bảng lô + kỳ, cấp lot_id và chuyển đổi pick cũ trong MỘT giao dịch. Chạy lại không đổi gì. */
async function migrateLots() {
  const colsOf = async (t: string) => (await query(`PRAGMA table_info(${t})`)).map((c) => String(c.name))
  const upgrade = lotUpgradeSql({
    inventory_rows: await colsOf('inventory_rows'),
    picks: await colsOf('picks'),
    sources: await colsOf('sources'),
    pick_order_lines: await colsOf('pick_order_lines'),
  })
  const str = (v: unknown) => (v == null ? '' : String(v))
  // ALTER phải chạy trước khi SELECT các cột mới.
  await batch(upgrade.map((sql) => ({ sql })))
  const rows = (await query('SELECT r.id, r.sku, s.name AS source, r.location, r.batch_no, r.manuf_date, r.qty_system, r.lot_id FROM inventory_rows r JOIN sources s ON s.id = r.source_id')).map((r) => ({
    id: r.id as number, sku: str(r.sku), source: str(r.source), location: str(r.location), batch_no: str(r.batch_no),
    manuf_date: str(r.manuf_date), qty_system: Number(r.qty_system) || 0, lot_id: (r.lot_id as number | null) ?? null,
  }))
  const picks = (await query('SELECT * FROM picks WHERE period IS NULL AND lot_id IS NULL')).map((r) => ({
    id: r.id as number, sku: str(r.sku), description: str(r.description), source: str(r.source), location: str(r.location),
    batch_no: str(r.batch_no), uom: str(r.uom), qty: Number(r.qty) || 0, order_no: r.order_no == null ? null : String(r.order_no),
    picked_at: str(r.picked_at), note: str(r.note), pick_order_id: (r.pick_order_id as number | null) ?? null,
    lot_id: null, period: null,
  }))
  const srcs = await query('SELECT name, loaded_at, period FROM sources')
  const [{ n: counter }] = await query('SELECT n FROM lot_counter WHERE id = 1')
  const plan = planLotMigration({
    rows, picks, counter: Number(counter) || 0,
    loadedAt: Object.fromEntries(srcs.map((s) => [str(s.name), str(s.loaded_at)])),
    currentPeriod: Object.fromEntries(srcs.map((s) => [str(s.name), Number(s.period) || 1])),
  })
  if (plan.statements.length) await batch(plan.statements)
}

const toSource =(r: Record<string, unknown>): Source => ({
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
  period: Number(r.period) || 1,
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

/** Nạp file mới = mở kỳ mới của nguồn: period+1, lot_id mới; picks/sửa cũ giữ nguyên (kỳ cũ). */
export async function replaceRows(sourceId: number, rows: StdRow[], meta: { file_name: string; skipped: string }) {
  await initSchema()
  await batch(replaceRowsSql(sourceId, STD_FIELDS, rows.map((r) => STD_FIELDS.map((f) => r[f] as string | number | null)), meta))
}

/** Số lần lấy và số thao tác sửa/nhập của kỳ hiện tại một nguồn (cho cảnh báo trước khi nạp). */
export async function getPeriodActivity(src: Source): Promise<{ picks: number; edits: number }> {
  await initSchema()
  const picks = await query('SELECT source, period, picked_at FROM picks WHERE source = ?', [src.name])
  const edits = await query('SELECT source, at FROM inventory_edits WHERE source = ?', [src.name])
  return countPeriodActivity(
    { name: src.name, period: src.period, loaded_at: src.loaded_at },
    picks.map((p) => ({ source: p.source as string | null, period: (p.period as number | null) ?? null, picked_at: p.picked_at as string | null })),
    edits.map((e) => ({ source: String(e.source ?? ''), at: String(e.at ?? '') })),
  )
}

/** Nạp file khối lượng: thay hoàn toàn bảng cũ. */
export async function replaceSkuWeights(rows: WeightRow[]) {
  await initSchema()
  await batch([
    { sql: 'DELETE FROM sku_weight' },
    ...rows.map((r) => ({ sql: 'INSERT OR REPLACE INTO sku_weight (sku_key, sku, weight_kg) VALUES (?, ?, ?)', bind: [r.key, r.sku, r.weight_kg] })),
  ])
}

/** Map sku_key (weightKey) -> kg. */
export async function getSkuWeights(): Promise<Map<string, number>> {
  await initSchema()
  const rows = await query('SELECT sku_key, weight_kg FROM sku_weight')
  return new Map(rows.map((r) => [r.sku_key as string, r.weight_kg as number]))
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

export type SkuRow = InvRow & { source: string; lot_id: number | null }

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

const toCustomer = (r: Record<string, unknown>): Customer => normalizeCustomer(r as Partial<Customer>)

export async function listCustomers(): Promise<Customer[]> {
  await initSchema()
  return (await query('SELECT * FROM customers ORDER BY name COLLATE NOCASE, code')).map(toCustomer)
}

/** Thêm khách mới. Trả thông báo lỗi (trùng mã, thiếu trường) hoặc null nếu thành công. */
export async function addCustomer(input: Partial<Customer>): Promise<string | null> {
  await initSchema()
  const c = normalizeCustomer(input)
  const existing = (await query('SELECT code FROM customers')).map((r) => String(r.code))
  const err = validateCustomer(c, existing)
  if (err) return err
  await batch([{ sql: `INSERT INTO customers (code_key, ${CUSTOMER_FIELDS.join(', ')}) VALUES (?, ${CUSTOMER_FIELDS.map(() => '?').join(', ')})`, bind: [customerKey(c.code), ...CUSTOMER_FIELDS.map((f) => c[f])] }])
  return null
}

/** Sửa khách (giữ nguyên mã). Trả lỗi hoặc null. */
export async function updateCustomer(code: string, input: Partial<Customer>): Promise<string | null> {
  await initSchema()
  const c = normalizeCustomer({ ...input, code })
  const err = validateCustomer(c, [])
  if (err) return err
  const sets = CUSTOMER_FIELDS.filter((f) => f !== 'code')
  await batch([{ sql: `UPDATE customers SET ${sets.map((f) => `${f} = ?`).join(', ')} WHERE code_key = ?`, bind: [...sets.map((f) => c[f]), customerKey(code)] }])
  return null
}

/** Xoá khách; PK đang dùng mã này giữ nguyên mã chữ. */
export async function deleteCustomer(code: string) {
  await initSchema()
  await batch([{ sql: 'DELETE FROM customers WHERE code_key = ?', bind: [customerKey(code)] }])
}

// ---------- Sửa / di chuyển / tách / gộp dòng tồn ----------

const nowStamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Đổi EditOp thành câu SQL; tên cột lấy từ STD_FIELDS (không nối chuỗi từ ngoài). */
type SqlBind = (string | number | null)[]
export function editOpsToSql(ops: EditOp[]): { sql: string; bind?: SqlBind }[] {
  const cols = new Set<string>(STD_FIELDS)
  return ops.flatMap((o): { sql: string; bind?: SqlBind }[] => {
    if (o.op === 'delete') return [{ sql: 'DELETE FROM inventory_rows WHERE id = ?', bind: [o.id] }]
    if (o.op === 'repoint_picks') return [{ sql: 'UPDATE picks SET lot_id = ? WHERE lot_id = ?', bind: [o.to, o.from] }]
    if (o.op === 'insert') {
      // lot_id mới: tăng lot_counter (không tái dùng) rồi lấy giá trị, trong cùng giao dịch
      const c = ['source_id', ...STD_FIELDS, 'lot_id']
      return [
        { sql: 'UPDATE lot_counter SET n = n + 1 WHERE id = 1' },
        { sql: `INSERT INTO inventory_rows (${c.join(',')}) VALUES (?,${STD_FIELDS.map(() => '?').join(',')},(SELECT n FROM lot_counter WHERE id = 1))`, bind: [o.source_id, ...STD_FIELDS.map((f) => o.row[f])] as SqlBind },
      ]
    }
    const keys = Object.keys(o.set).filter((k) => cols.has(k)) as StdField[]
    return [{ sql: `UPDATE inventory_rows SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, bind: [...keys.map((k) => o.set[k] ?? null), o.id] as SqlBind }]
  })
}

export const editLogSql = (log: EditLog, at = nowStamp()) => ({
  sql: 'INSERT INTO inventory_edits (at, kind, sku, source, before, after) VALUES (?, ?, ?, ?, ?, ?)',
  bind: [at, log.kind, log.sku, log.source, JSON.stringify(log.before), JSON.stringify(log.after)],
})

/** Áp một kế hoạch (từ planEdit/Move/Split/Merge): thao tác dòng + 1 dòng nhật ký trong một giao dịch. */
export async function applyEditPlan(plan: EditPlan): Promise<void> {
  if (!plan.ok) throw new Error(plan.error)
  await initSchema()
  await batch([...editOpsToSql(plan.ops), editLogSql(plan.log)])
}

/** Áp phiếu nhập (từ planReceive): mọi thao tác dòng + mỗi SKU một dòng nhật ký, trong một giao dịch. */
export async function applyReceivePlan(plan: ReceivePlan): Promise<void> {
  if (!plan.ok) throw new Error(plan.error)
  await initSchema()
  const at = nowStamp()
  await batch([...editOpsToSql(plan.ops), ...plan.logs.map((l) => editLogSql(l, at))])
}

export interface InventoryEdit { id: number; at: string; kind: string; sku: string; source: string; before: unknown; after: unknown }

const parseJson = (v: unknown) => { try { return JSON.parse(String(v ?? 'null')) } catch { return null } }

/** Nhật ký thao tác, mới nhất trước. */
export async function listInventoryEdits(limit = 200): Promise<InventoryEdit[]> {
  await initSchema()
  return (await query('SELECT * FROM inventory_edits ORDER BY at DESC, id DESC LIMIT ?', [limit])).map((r) => ({
    id: r.id as number, at: String(r.at ?? ''), kind: String(r.kind ?? ''), sku: String(r.sku ?? ''), source: String(r.source ?? ''),
    before: parseJson(r.before), after: parseJson(r.after),
  }))
}
