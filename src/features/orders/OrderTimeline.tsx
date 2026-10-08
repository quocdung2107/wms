import { Card } from '../../shared/ui/ui'
import { fmtTime } from './format'
import { statusOf } from './status'
import type { GroupCtx, OrderEvent } from './types'

function describe(e: OrderEvent, ctx: GroupCtx): string {
  switch (e.type) {
    case 'CREATED':
      return 'Tạo đơn'
    case 'STATUS_CHANGED':
      return `Đổi trạng thái: ${statusOf(e.from_status ?? '').label} → ${statusOf(e.to_status ?? '').label}`
    case 'ASSIGNED':
      return e.note ? `Giao cho ${ctx.nameOf(e.note)}` : 'Bỏ người xử lý'
    case 'NOTE':
      return 'Ghi chú'
    case 'ISSUE_OPENED':
      return 'Báo sự cố'
    case 'ISSUE_RESOLVED':
      return 'Đã xử lý sự cố'
    case 'COMPLETED':
      return 'Hoàn thành'
    case 'REOPENED':
      return 'Mở lại đơn'
    default:
      return e.type
  }
}

export function OrderTimeline({ ctx, events }: { ctx: GroupCtx; events: OrderEvent[] }) {
  return (
      <Card className="space-y-2">
        <h3 className="text-lg font-semibold">Timeline</h3>
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-teal-600 pl-3">
              <div className="text-sm text-slate-600">
                {fmtTime(e.created_at)} — {ctx.nameOf(e.actor_id)}
              </div>
              <div className="font-medium">{describe(e, ctx)}</div>
              {e.note && e.type !== 'ASSIGNED' && <div className="whitespace-pre-wrap break-words text-slate-700">{e.note}</div>}
            </li>
          ))}
        </ol>
      </Card>
  )
}
