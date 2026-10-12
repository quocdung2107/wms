import { asNumber, asText, type SheetData } from '../excel/reader.ts'
import { skuKey } from './history.ts'

export interface WeightRow {
  key: string
  sku: string
  weight_kg: number
}

export interface WeightParse {
  rows: WeightRow[]
  /** Dòng bị bỏ qua: SKU rỗng, kg rỗng/không phải số/<=0. */
  skipped: number
}

/** Khoá ghép SKU: bỏ mọi khoảng trắng + skuKey (không phân biệt hoa/thường). */
export const weightKey = (sku: string) => skuKey(sku.replace(/\s+/g, ''))

/**
 * Đọc file khối lượng theo chỉ số cột do người dùng chọn. Dòng dữ liệu bắt đầu sau headerRow.
 * SKU trùng lấy dòng cuối (Giả định).
 */
export function parseWeightSheet(sheet: SheetData, skuCol: number, kgCol: number, headerRow = 0): WeightParse {
  const map = new Map<string, WeightRow>()
  let skipped = 0
  for (let i = headerRow + 1; i < sheet.matrix.length; i++) {
    const r = sheet.matrix[i] ?? []
    const sku = asText(r[skuCol])
    const kg = asNumber(r[kgCol])
    const blank = !sku && (r[kgCol] === null || r[kgCol] === undefined || r[kgCol] === '')
    if (blank) continue
    if (!sku || kg === null || kg <= 0) { skipped++; continue }
    const key = weightKey(sku)
    map.delete(key) // dòng cuối thắng, xếp theo thứ tự xuất hiện cuối
    map.set(key, { key, sku, weight_kg: kg })
  }
  return { rows: [...map.values()], skipped }
}
