/** Thứ tự vòng đời đơn (khớp STATUSES trong status.tsx). Hàm thuần, không import JSX. */
export const FLOW = ['CREATED', 'CONFIRMED', 'PICKING', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'] as const

/** Trạng thái kế tiếp cho Quick Status; DELIVERED/COMPLETED/không rõ → null (COMPLETED qua complete_order). */
export function nextStatus(code: string): string | null {
  const i = FLOW.indexOf(code as (typeof FLOW)[number])
  if (i < 0 || i >= FLOW.indexOf('DELIVERED')) return null
  return FLOW[i + 1]
}
