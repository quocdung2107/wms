// Nạp Excel seed 1 lần vào bảng carriers (nguồn community). Chạy bởi Dung, KHÔNG đưa key vào git.
//
//   node scripts/seed-carriers.ts <file.xlsx> --dry-run          (không cần key, không gọi mạng)
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
//     node scripts/seed-carriers.ts <file.xlsx>
//
// Chống trùng: khoá = tên (hạ chữ thường, gộp khoảng trắng) + SĐT chuẩn hoá (số đầu tiên).
// Trùng với dòng đã có trong DB hoặc trùng trong chính file thì bỏ qua. DB không có unique,
// nên đừng chạy 2 lần song song.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { readWorkbook, MAX_FILE_BYTES, type Cell } from '../src/shared/excel/reader.ts'

export interface SeedRow {
  name: string
  description: string
  regions: string[]
  vehicle_types: string[]
  phone: string | null
  email: string | null
  zalo: string | null
}

const LIMITS = { name: 120, description: 1000, phone: 30, email: 120, zalo: 30 }

const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

/** Một SĐT -> dạng 0xxxxxxxxx (bỏ +84/84, dấu chấm, khoảng trắng); null nếu không ra số hợp lệ. */
export function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  let d = String(raw).replace(/[^\d+]/g, '')
  if (d.startsWith('+84')) d = '0' + d.slice(3)
  else if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2)
  d = d.replace(/\D/g, '')
  if (/^[1-9]\d{8,9}$/.test(d)) d = '0' + d // ô số trong Excel mất số 0 đầu
  return /^0\d{9,10}$/.test(d) ? d : null
}

/** Ô có thể chứa nhiều SĐT (ngăn bởi / , ; xuống dòng). Trả danh sách đã chuẩn hoá, bỏ trùng. */
export function normalizePhones(raw: Cell | undefined): string[] {
  if (raw === null || raw === undefined) return []
  const parts = typeof raw === 'number' ? [raw] : String(raw).split(/[/,;\n]+/)
  const out: string[] = []
  for (const p of parts) {
    const n = normalizePhone(p)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

export const normName = (name: string) => name.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

export function dedupeKey(name: string, phone: string | null): string {
  const first = phone ? (normalizePhones(phone)[0] ?? phone) : ''
  return `${normName(name)}|${first}`
}

const splitList = (v: Cell | undefined): string[] =>
  v === null || v === undefined
    ? []
    : [...new Set(String(v).split(/[,;/\n]+/).map((s) => s.trim()).filter(Boolean))]

const text = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim())

const ALIASES: Record<keyof SeedRow, string[]> = {
  name: ['ten', 'ten nha van tai', 'ten cong ty', 'nha van tai', 'cong ty', 'name', 'carrier', 'company'],
  description: ['mo ta', 'ghi chu', 'gioi thieu', 'description', 'note', 'notes'],
  regions: ['khu vuc', 'tuyen', 'tinh thanh', 'khu vuc hoat dong', 'region', 'regions', 'area'],
  vehicle_types: ['loai xe', 'xe', 'phuong tien', 'vehicle', 'vehicle type', 'vehicle types'],
  phone: ['sdt', 'so dien thoai', 'dien thoai', 'phone', 'tel', 'hotline', 'lien he'],
  email: ['email', 'e-mail', 'mail'],
  zalo: ['zalo'],
}

/** Tìm chỉ số cột theo tiêu đề (không dấu, không phân biệt hoa thường). */
export function mapHeader(header: Cell[]): Partial<Record<keyof SeedRow, number>> {
  const map: Partial<Record<keyof SeedRow, number>> = {}
  const labels = header.map((h) => strip(text(h)))
  for (const field of Object.keys(ALIASES) as (keyof SeedRow)[]) {
    const i = labels.findIndex((l, idx) => l !== '' && ALIASES[field].includes(l) && !Object.values(map).includes(idx))
    if (i >= 0) map[field] = i
  }
  return map
}

export interface ParseResult {
  rows: SeedRow[]
  skipped: { line: number; reason: string }[]
}

/** matrix: dòng 0 là tiêu đề. Dòng lỗi (thiếu tên, quá dài) bị bỏ qua và báo lý do. */
export function parseMatrix(matrix: Cell[][]): ParseResult {
  const map = mapHeader(matrix[0] ?? [])
  if (map.name === undefined) throw new Error('Không tìm thấy cột tên nhà vận tải trong dòng tiêu đề')
  const rows: SeedRow[] = []
  const skipped: ParseResult['skipped'] = []
  const get = (r: Cell[], f: keyof SeedRow) => (map[f] === undefined ? undefined : r[map[f]])
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i]
    const line = i + 1
    if (!r || r.every((c) => c === null || text(c) === '')) continue
    const name = text(get(r, 'name')).replace(/\s+/g, ' ')
    if (!name) { skipped.push({ line, reason: 'thiếu tên' }); continue }
    const phones = normalizePhones(get(r, 'phone'))
    let phone: string | null = phones.join(', ')
    if (phone.length > LIMITS.phone) phone = phones[0]
    const zaloPhones = normalizePhones(get(r, 'zalo'))
    const row: SeedRow = {
      name,
      description: text(get(r, 'description')),
      regions: splitList(get(r, 'regions')),
      vehicle_types: splitList(get(r, 'vehicle_types')),
      phone: phone || null,
      email: text(get(r, 'email')) || null,
      zalo: zaloPhones[0] ?? (text(get(r, 'zalo')) || null),
    }
    const over = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).find(
      (k) => ((row[k] as string | null) ?? '').length > LIMITS[k],
    )
    if (over) { skipped.push({ line, reason: `${over} quá dài` }); continue }
    rows.push(row)
  }
  return { rows, skipped }
}

/** Lọc bỏ dòng trùng khoá với `existing` hoặc trùng nhau trong chính file. */
export function dedupe(rows: SeedRow[], existing: Set<string>) {
  const seen = new Set(existing)
  const fresh: SeedRow[] = []
  const duplicates: SeedRow[] = []
  for (const r of rows) {
    const k = dedupeKey(r.name, r.phone)
    if (seen.has(k)) duplicates.push(r)
    else { seen.add(k); fresh.push(r) }
  }
  return { fresh, duplicates }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry-run')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('Cách dùng: node scripts/seed-carriers.ts <file.xlsx> [--dry-run]')
    process.exit(1)
  }
  const buf = readFileSync(file)
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error('File quá lớn (> 20 MB)')
  const sheet = readWorkbook(buf)[0]
  if (!sheet) throw new Error('File không có sheet nào')
  const { rows, skipped } = parseMatrix(sheet.matrix)

  const existing = new Set<string>()
  let client: ReturnType<typeof createClient> | null = null
  if (!dry) {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.error('Thiếu SUPABASE_URL và/hoặc SUPABASE_SERVICE_ROLE_KEY trong biến môi trường.')
      process.exit(1)
    }
    client = createClient(url, key, { auth: { persistSession: false } })
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('carriers').select('name, phone').range(from, from + 999)
      if (error) throw new Error(`Đọc carriers lỗi: ${error.message}`)
      for (const c of data) existing.add(dedupeKey(c.name as string, c.phone as string | null))
      if (data.length < 1000) break
    }
  }
  const { fresh, duplicates } = dedupe(rows, existing)

  if (!dry && client && fresh.length) {
    const payload = fresh.map((r) => ({ ...r, source: 'community' }))
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await client.from('carriers').insert(payload.slice(i, i + 200))
      if (error) throw new Error(`Chèn carriers lỗi (lô ${i}): ${error.message}`)
    }
  }
  console.log(`${dry ? '[DRY-RUN] ' : ''}Đọc ${rows.length} dòng hợp lệ; ${dry ? 'sẽ thêm' : 'đã thêm'} ${fresh.length}; bỏ trùng ${duplicates.length}; bỏ lỗi ${skipped.length}.`)
  for (const s of skipped) console.log(`  dòng ${s.line}: ${s.reason}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
