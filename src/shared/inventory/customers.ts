// Khách hàng (cục bộ). Module thuần: validate + chuẩn hoá, không import DB.
export interface Customer {
  code: string
  name: string
  short_name: string
  address: string
  delivery_address: string
  contact: string
  sup: string
  phone1: string
  phone2: string
  note: string
}

export const CUSTOMER_FIELDS = ['code', 'name', 'short_name', 'address', 'delivery_address', 'contact', 'sup', 'phone1', 'phone2', 'note'] as const

/** Khoá so sánh Mã KH: bỏ khoảng trắng hai đầu, không phân biệt hoa thường. */
export const customerKey = (code: string) => code.trim().toUpperCase()

export function normalizeCustomer(c: Partial<Customer>): Customer {
  const t = (v: unknown) => String(v ?? '').trim()
  return {
    code: t(c.code), name: t(c.name), short_name: t(c.short_name), address: t(c.address),
    delivery_address: t(c.delivery_address), contact: t(c.contact), sup: t(c.sup),
    phone1: t(c.phone1), phone2: t(c.phone2), note: t(c.note),
  }
}

/** Trả thông báo lỗi (tiếng Việt) hoặc null nếu hợp lệ. `existing` = các mã đã có (bỏ mã đang sửa). */
export function validateCustomer(c: Customer, existing: string[]): string | null {
  if (!c.code) return 'Mã KH không được để trống.'
  if (c.code.length > 50) return 'Mã KH tối đa 50 ký tự.'
  if (!c.name) return 'Tên khách không được để trống.'
  const k = customerKey(c.code)
  if (existing.some((e) => customerKey(e) === k)) return `Mã KH "${c.code}" đã tồn tại.`
  return null
}

/** Tên hiển thị của khách theo mã; thiếu khách (đã xoá) thì hiện mã. */
export function customerLabel(code: string | null | undefined, list: Customer[]): string {
  const c = (code ?? '').trim()
  if (!c) return ''
  const k = customerKey(c)
  return list.find((x) => customerKey(x.code) === k)?.name || c
}
