export type CarrierSource = 'community' | 'claimed'

/** Trường công khai (có trong view carriers_public). */
export type Carrier = {
  id: string
  name: string
  description: string
  regions: string[]
  vehicle_types: string[]
  source: CarrierSource
  last_verified_at: string | null
  created_at: string
  /** Chỉ có khi đã đăng nhập (đọc từ bảng carriers). owner_id null = chưa có chủ. */
  owner_id?: string | null
  phone?: string | null
  email?: string | null
  zalo?: string | null
}

export const SOURCE_LABELS: Record<CarrierSource, string> = {
  community: 'Cộng đồng',
  claimed: 'Đã claim',
}
