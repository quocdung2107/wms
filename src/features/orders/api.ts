import { supabase } from '../../shared/supabase/client'

/** Chỉ gọi sau khi đã đăng nhập (OrdersPage đã chặn trường hợp chưa cấu hình). */
export const sb = () => supabase!

const ERRORS: Record<string, string> = {
  forbidden: 'Bạn không có quyền làm việc này.',
  not_authenticated: 'Cần đăng nhập.',
  user_not_found: 'Không tìm thấy tài khoản này. Người đó cần đăng nhập app ít nhất một lần.',
  already_member: 'Người này đã ở trong group.',
  last_admin: 'Group phải còn ít nhất một admin.',
  duplicate_code: 'Mã đơn đã tồn tại trong group.',
  backward_needs_note_one_step: 'Chỉ được lùi đúng 1 bước và phải ghi lý do.',
  order_completed: 'Đơn đã hoàn thành.',
  order_not_found: 'Không tìm thấy đơn.',
  not_completed: 'Đơn chưa hoàn thành.',
  note_required: 'Cần nhập nội dung.',
  issue_already_open: 'Đơn đang có sự cố.',
  no_open_issue: 'Đơn không có sự cố đang mở.',
  invalid_status: 'Trạng thái không hợp lệ.',
  use_complete_order: 'Dùng nút Hoàn thành để kết thúc đơn.',
  assignee_not_member: 'Người xử lý phải là thành viên group.',
  not_found: 'Không tìm thấy.',
  'check constraint': 'Nội dung trống hoặc quá dài.',
}

export function errText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? '')
  for (const [k, v] of Object.entries(ERRORS)) if (m.includes(k)) return v
  return 'Có lỗi, thử lại sau.'
}

export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await sb().rpc(name, args)
  if (error) throw error
  return data
}
