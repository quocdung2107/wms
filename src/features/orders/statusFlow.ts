/** Thứ tự vòng đời đơn (khớp STATUSES trong status.tsx). Hàm thuần, không import JSX. */
export const FLOW = ['CREATED', 'CONFIRMED', 'PICKING', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'] as const

/** Trạng thái kế tiếp cho Quick Status; DELIVERED/COMPLETED/không rõ → null (COMPLETED qua complete_order). */
export function nextStatus(code: string): string | null {
  const i = FLOW.indexOf(code as (typeof FLOW)[number])
  if (i < 0 || i >= FLOW.indexOf('DELIVERED')) return null
  return FLOW[i + 1]
}

/** Đích đổi trạng thái mỗi vai trò làm việc được (khớp change_status trong migration 20261014). */
const OPERATOR_TARGETS = ['CONFIRMED', 'PICKING', 'DELIVERED']
const DRIVER_TARGETS = ['IN_TRANSIT']

/** Trạng thái đích người dùng được đổi tới (không gồm COMPLETED, đi qua complete_order). Quyền thật nằm ở RPC. */
export function allowedTargets(roles: string[], isAssignee: boolean): string[] {
  const all = FLOW.filter((c) => c !== 'COMPLETED') as string[]
  if (roles.includes('admin') || roles.includes('coordinator')) return all
  if (!isAssignee) return []
  const out = new Set<string>()
  if (roles.includes('operator')) OPERATOR_TARGETS.forEach((c) => out.add(c))
  if (roles.includes('driver')) DRIVER_TARGETS.forEach((c) => out.add(c))
  return all.filter((c) => out.has(c))
}
