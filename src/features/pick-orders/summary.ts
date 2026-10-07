// Dựng nội dung tin "tổng hợp picking" gửi vào chat Order. Hàm thuần (test được dưới node).
import { normOrderRef, pickedBySku, type PickLine } from './logic.ts'

export const SUMMARY_MAX = 2000

export interface PickSummaryInput {
  pickCode: string
  orderCode: string
  customerName?: string | null
  customerAddress?: string | null
  shipmentCode?: string | null
  lines: PickLine[]
  picks: { sku: string; qty: number }[]
  /** Chừa chỗ: khi có giá trị sẽ hiện dòng "Khối lượng". Hiện chưa ai truyền. */
  weightText?: string | null
}

const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000)

/** Chọn các đơn picking có order_ref khớp mã Order (so sánh qua normOrderRef). */
export function matchPickOrders<T extends { order_ref: string | null }>(pickOrders: T[], orderCode: string): T[] {
  const k = normOrderRef(orderCode)
  if (!k) return []
  return pickOrders.filter((p) => normOrderRef(p.order_ref) === k)
}

/** Tổng đã lấy/cần theo từng ĐVT (không quy đổi). */
export function totalsByUom(lines: PickLine[], picked: Map<string, number>): { uom: string; need: number; picked: number }[] {
  const m = new Map<string, { uom: string; need: number; picked: number }>()
  for (const l of lines) {
    const uom = l.uom.trim()
    const cur = m.get(uom) ?? { uom, need: 0, picked: 0 }
    cur.need += l.qty_need
    cur.picked += picked.get(l.sku.trim().toUpperCase()) ?? 0
    m.set(uom, cur)
  }
  return [...m.values()]
}

export function buildPickSummary(inp: PickSummaryInput): string {
  const picked = pickedBySku(inp.picks)
  const head: string[] = [`📦 Tổng hợp picking ${inp.pickCode} / ${inp.orderCode}`]
  if (inp.customerName?.trim()) head.push(`Người đặt: ${inp.customerName.trim()}`)
  if (inp.customerAddress?.trim()) head.push(`Địa chỉ đặt: ${inp.customerAddress.trim()}`)
  if (inp.shipmentCode?.trim()) head.push(`Mã vận chuyển: ${inp.shipmentCode.trim()}`)
  const totals = totalsByUom(inp.lines, picked)
  head.push(`Số dòng SKU: ${inp.lines.length}`)
  head.push(`Đã lấy/cần: ${totals.length ? totals.map((t) => `${fmtNum(t.picked)}/${fmtNum(t.need)}${t.uom ? ' ' + t.uom : ''}`).join(' · ') : '0/0'}`)
  if (inp.weightText?.trim()) head.push(`Khối lượng: ${inp.weightText.trim()}`)
  // Phần đầu cũng bị chặn để không vượt giới hạn dù địa chỉ rất dài.
  let text = head.join('\n')
  if (text.length > SUMMARY_MAX) return text.slice(0, SUMMARY_MAX - 1) + '…'

  const rows = inp.lines.map((l) => {
    const p = picked.get(l.sku.trim().toUpperCase()) ?? 0
    return `• ${l.sku}: ${fmtNum(p)}/${fmtNum(l.qty_need)}${l.uom ? ' ' + l.uom : ''}`
  })
  let shown = 0
  for (const r of rows) {
    const rest = rows.length - shown - 1
    const tail = rest > 0 ? `\n… và ${rest} dòng nữa` : ''
    const next = `${text}${shown === 0 ? '\n' : ''}\n${r}`
    if (next.length + tail.length > SUMMARY_MAX) break
    text = next
    shown++
  }
  if (shown < rows.length) {
    const tail = `\n… và ${rows.length - shown} dòng nữa`
    text = (text + tail).length <= SUMMARY_MAX ? text + tail : text
  }
  return text
}
