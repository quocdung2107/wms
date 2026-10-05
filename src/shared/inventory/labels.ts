import type { StdField } from '../excel/reader.ts'

export const FIELD_LABELS: Record<StdField, string> = {
  warehouse: 'Kho',
  location: 'Vị trí',
  sku: 'SKU / Mã hàng (bắt buộc)',
  description: 'Tên hàng',
  category: 'Nhóm hàng',
  uom_raw: 'ĐVT',
  qty_system: 'SL hệ thống (cột số lượng để kiểm)',
  qty_available: 'SL khả dụng',
  qty_damaged: 'SL hỏng',
  qty_hold: 'SL giữ (Hold)',
  condition: 'Tình trạng',
  batch_no: 'Batch No',
  lot_no: 'Lot No',
  manuf_date: 'Ngày SX',
  receive_date: 'Ngày nhập',
  expiry_date: 'Hạn dùng',
}
