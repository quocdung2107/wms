import { supabase } from '../../shared/supabase/client'
import type { Carrier } from './types'

const PUBLIC_COLS = 'id,name,description,regions,vehicle_types,source,last_verified_at,created_at'
const FULL_COLS = `${PUBLIC_COLS},owner_id,phone,email,zalo`

/** Khách đọc view carriers_public (không có liên hệ); đã đăng nhập đọc bảng carriers. */
export async function listCarriers(loggedIn: boolean): Promise<Carrier[]> {
  if (!supabase) throw new Error('Chưa cấu hình Supabase')
  const { data, error } = await supabase
    .from(loggedIn ? 'carriers' : 'carriers_public')
    .select(loggedIn ? FULL_COLS : PUBLIC_COLS)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Carrier[]
}

export type CarrierInput = {
  name: string
  description: string
  regions: string[]
  vehicle_types: string[]
  phone: string
  email: string
  zalo: string
}

/** Thông báo lỗi từ RPC (đã là tiếng Việt); không có thì báo chung. */
export function carrierErr(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? '').trim()
  return m && m.length < 200 && /[à-ỹ]/i.test(m) ? m : 'Có lỗi, thử lại sau.'
}

const sb = () => {
  if (!supabase) throw new Error('Chưa cấu hình Supabase')
  return supabase
}

export async function addCarrier(i: CarrierInput): Promise<string> {
  const { data, error } = await sb().rpc('add_carrier', {
    p_name: i.name,
    p_description: i.description,
    p_regions: i.regions,
    p_vehicle_types: i.vehicle_types,
    p_phone: i.phone,
    p_email: i.email,
    p_zalo: i.zalo,
  })
  if (error) throw error
  return data as string
}

export async function suggestCarrierUpdate(carrierId: string, proposed: Partial<CarrierInput>): Promise<void> {
  const { error } = await sb().rpc('suggest_carrier_update', { p_carrier_id: carrierId, p_proposed: proposed })
  if (error) throw error
}

/** true = đã ghi nhận; false = hôm nay đã xác nhận rồi. */
export async function verifyCarrier(carrierId: string): Promise<boolean> {
  const { data, error } = await sb().rpc('verify_carrier', { p_carrier_id: carrierId })
  if (error) throw error
  return data === true
}

export async function isSystemAdmin(): Promise<boolean> {
  const { data, error } = await sb().rpc('is_system_admin')
  if (error) return false
  return data === true
}

export type PendingSuggestion = {
  id: string
  carrier_id: string
  proposed: Partial<CarrierInput>
  created_at: string
}

/** RLS: admin thấy mọi đề xuất. */
export async function listPendingSuggestions(): Promise<PendingSuggestion[]> {
  const { data, error } = await sb()
    .from('carrier_suggestions')
    .select('id,carrier_id,proposed,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as PendingSuggestion[]
}

export async function reviewSuggestion(id: string, approve: boolean): Promise<void> {
  const { error } = await sb().rpc('review_carrier_suggestion', { p_suggestion_id: id, p_approve: approve })
  if (error) throw error
}

/** Chủ carrier sửa trực tiếp; server đặt last_verified_at = now(). */
export async function updateOwnCarrier(carrierId: string, changes: CarrierInput): Promise<void> {
  const { error } = await sb().rpc('update_own_carrier', { p_carrier_id: carrierId, p_changes: changes })
  if (error) throw error
}

export async function claimCarrier(carrierId: string, contact: string, note: string): Promise<string> {
  const { data, error } = await sb().rpc('claim_carrier', { p_carrier_id: carrierId, p_contact: contact, p_note: note })
  if (error) throw error
  return data as string
}

export type PendingClaim = {
  id: string
  carrier_id: string
  claimant_id: string
  contact: string
  note: string
  created_at: string
}

/** RLS: admin thấy mọi claim. */
export async function listPendingClaims(): Promise<PendingClaim[]> {
  const { data, error } = await sb()
    .from('carrier_claims')
    .select('id,carrier_id,claimant_id,contact,note,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as PendingClaim[]
}

export async function reviewClaim(id: string, approve: boolean): Promise<void> {
  const { error } = await sb().rpc('review_carrier_claim', { p_claim_id: id, p_approve: approve })
  if (error) throw error
}
