export type Order = {
  id: string
  group_id: string
  code: string
  goods: string
  weight_kg: number
  packages: number
  pickup_at: string
  delivery_at: string
  pickup_address: string
  delivery_address: string
  contact_name: string
  contact_phone: string
  customer_name: string
  customer_address: string
  /** Mã KH (migration 20261010000000); undefined khi DB chưa áp dụng. */
  customer_code?: string
  shipment_code: string | null
  priority: 'NORMAL' | 'URGENT'
  status: string
  assignee_id: string | null
  issue_open: boolean
  created_by: string
  created_at: string
  updated_at: string
  last_activity_at: string
  completed_at: string | null
  needs_attention: boolean
  attention_reason: 'ISSUE' | 'STALE_24H' | null
}

export type OrderEvent = {
  id: number
  order_id: string
  actor_id: string
  type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  created_at: string
}

export type Attachment = { id: number; message_id: number; group_id: string; path: string; width: number | null; height: number | null; position: number; expires_at?: string | null; expired?: boolean }

export type Message = {
  id: number
  group_id: string
  order_id: string | null
  shared_order_id: string | null
  sender_id: string
  body: string
  created_at: string
  attachments?: Attachment[]
}

export type Member = { user_id: string; roles: string[]; name: string }

export type GroupCtx = {
  groupId: string
  me: string
  roles: string[]
  members: Member[]
  nameOf: (id: string | null) => string
  /** admin */
  isAdmin: boolean
  /** coordinator hoặc admin: tạo đơn, giao người, hoàn thành */
  canCoordinate: boolean
  /** có vai trò làm việc (khác viewer): gửi thẻ đơn, mã vận chuyển, sự cố */
  canWork: boolean
  /** có ít nhất một vai trò: ghi chú đơn (gồm Người theo dõi) */
  canNote: boolean
  reloadMembers: () => void
}

export const ROLES = [
  { code: 'admin', label: 'Admin' },
  { code: 'coordinator', label: 'Điều phối' },
  { code: 'operator', label: 'Người xử lý' },
  { code: 'driver', label: 'Lái xe' },
  { code: 'viewer', label: 'Người theo dõi' },
] as const
export const roleLabel = (c: string) => ROLES.find((r) => r.code === c)?.label ?? c
