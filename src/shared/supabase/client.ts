import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null khi chưa cấu hình: công cụ kho vẫn chạy, chỉ tab Đơn hàng báo thiếu cấu hình. */
export const supabase = url && key ? createClient(url, key) : null
