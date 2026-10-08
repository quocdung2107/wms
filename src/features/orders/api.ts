import { supabase } from '../../shared/supabase/client'
import { statusOf } from './status'

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
  shipment_exists: 'Đơn đã có mã vận chuyển. Gõ mã mới để thay.',
  duplicate_shipment_code: 'Mã vận chuyển đã dùng cho đơn khác trong group.',
  not_found: 'Không tìm thấy.',
  orders_delivery_after_pickup: 'Thời gian giao phải sau thời gian nhận.',
  image_too_large: 'Ảnh quá lớn, không nén được dưới 2 MB.',
  'Mỗi lần gửi 1 đến 10 ảnh': 'Mỗi lần gửi 1 đến 10 ảnh.',
  'check constraint': 'Nội dung trống hoặc quá dài.',
}

export function errText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? '')
  for (const [k, v] of Object.entries(ERRORS)) if (m.includes(k)) return v
  return 'Có lỗi, thử lại sau.'
}

const BUCKET = 'chat-images'

/** Tải các ảnh đã nén lên Storage; một ảnh lỗi thì ném lỗi (chưa tạo message nào). */
export async function uploadChatImages(groupId: string, images: { blob: Blob; width: number; height: number }[]) {
  const out: { path: string; width: number; height: number }[] = []
  for (const im of images) {
    const path = `${groupId}/${crypto.randomUUID()}.jpg`
    const { error } = await sb().storage.from(BUCKET).upload(path, im.blob, { contentType: 'image/jpeg', upsert: false })
    if (error) throw error
    out.push({ path, width: im.width, height: im.height })
  }
  return out
}

/** Tạo message + N attachment trong một giao dịch (sau khi ảnh đã tải xong). */
export async function sendMessageWithImages(groupId: string, orderId: string | null, body: string, images: { path: string; width: number; height: number }[]) {
  return (await rpc('send_message_with_images', { p_group_id: groupId, p_order_id: orderId, p_body: body, p_images: images })) as number
}

/** Signed URL theo lô (hết hạn sau 1 giờ); path không ký được thì không có trong kết quả. */
export async function signedImageUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (paths.length === 0) return map
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl)
  return map
}

export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await sb().rpc(name, args)
  if (error) throw error
  return data
}

/** Tiền tố đánh dấu dòng đổi trạng thái (message shared_order_id, không phải thẻ đầy đủ). */
export const STATUS_LINE_PREFIX = '↻ '

/** Thêm thẻ đơn vào chat chung của group. Ném lỗi nếu không gửi được (RLS: cần vai trò gửi thẻ). */
export async function pushOrderCard(ctx: { groupId: string; me: string }, order: { id: string; code: string; goods: string }) {
  const { error } = await sb().from('messages').insert({ group_id: ctx.groupId, sender_id: ctx.me, shared_order_id: order.id, body: `${order.code} — ${order.goods}`.slice(0, 2000) })
  if (error) throw error
}

/** Thêm một dòng ngắn "CODE: A → B" vào chat chung. Chỉ gửi khi canWork; lỗi bị nuốt (đổi trạng thái đã thành công). */
export async function pushStatusLine(ctx: { groupId: string; me: string; canWork: boolean }, order: { id: string; code: string }, from: string, to: string) {
  if (!ctx.canWork) return
  try {
    const body = `${STATUS_LINE_PREFIX}${order.code}: ${statusOf(from).label} → ${statusOf(to).label}`.slice(0, 2000)
    await sb().from('messages').insert({ group_id: ctx.groupId, sender_id: ctx.me, shared_order_id: order.id, body })
  } catch {
    /* bỏ qua */
  }
}
