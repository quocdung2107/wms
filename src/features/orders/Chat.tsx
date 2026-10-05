import { useEffect, useRef, useState } from 'react'
import { Button, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { errText, sb } from './api'
import { fmtTime } from './format'
import type { GroupCtx, Message } from './types'
import { useRealtime } from './useRealtime'

/** Chat chung của group (orderId = null) hoặc chat riêng trong một đơn. */
export function Chat({ ctx, orderId }: { ctx: GroupCtx; orderId: string | null }) {
  const [extra, setExtra] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)

  const initial = useLoad(async () => {
    let q = sb().from('messages').select('*').eq('group_id', ctx.groupId)
    q = orderId ? q.eq('order_id', orderId) : q.is('order_id', null)
    const { data, error } = await q.order('id', { ascending: false }).limit(100)
    if (error) throw error
    return (data as Message[]).reverse()
  }, [ctx.groupId, orderId])

  useRealtime(ctx.groupId, ['messages'], (_t, p) => {
    if (p.eventType !== 'INSERT') return
    const m = p.new as Message
    if ((m.order_id ?? null) !== orderId) return
    setExtra((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]))
  })

  const all = [...(initial.data ?? [])]
  for (const m of extra) if (!all.some((y) => y.id === m.id)) all.push(m)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [all.length])

  async function send() {
    const text = body.trim()
    if (!text) return
    setErr('')
    const { error } = await sb().from('messages').insert({ group_id: ctx.groupId, order_id: orderId, sender_id: ctx.me, body: text })
    if (error) setErr(errText(error))
    else setBody('')
  }

  return (
    <div className="space-y-3">
      <div className="max-h-96 min-h-32 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
        {initial.error && <Notice kind="error">Không tải được tin nhắn.</Notice>}
        {all.length === 0 && !initial.loading && <p className="text-slate-500">Chưa có tin nhắn.</p>}
        {all.map((m) => (
          <div key={m.id} className={m.sender_id === ctx.me ? 'text-right' : ''}>
            <div className="text-xs text-slate-500">
              {m.sender_id === ctx.me ? 'Bạn' : ctx.nameOf(m.sender_id)} · {fmtTime(m.created_at)}
            </div>
            <div className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left ${m.sender_id === ctx.me ? 'bg-teal-100' : 'bg-white'}`}>{m.body}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input className={inputClass} maxLength={2000} placeholder="Nhập tin nhắn…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" kind="primary" disabled={!body.trim()}>
          Gửi
        </Button>
      </form>
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  )
}
