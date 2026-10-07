import { useEffect, useRef, useState } from 'react'
import { Button, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { AlbumGrid } from './AlbumGrid'
import { errText, sb, sendMessageWithImages, uploadChatImages } from './api'
import { fmtDay, fmtTime } from './format'
import { compressImage, MAX_IMAGES, takeImages } from './imageUtils'
import { AttentionBadge, StatusBadge } from './status'
import type { Attachment, GroupCtx, Message, Order } from './types'
import { useRealtime } from './useRealtime'

function OrderCard({ order, loading, onOpen }: { order: Order | undefined; loading: boolean; onOpen?: (id: string) => void }) {
  if (!order) return <div className="inline-block rounded-lg bg-white px-3 py-2 text-slate-500">{loading ? 'Đang tải đơn…' : 'Đơn không còn truy cập được.'}</div>
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={() => onOpen?.(order.id)}
      className={`block w-full max-w-sm space-y-1 rounded-xl border bg-white p-3 text-left shadow-sm hover:bg-slate-50 ${order.needs_attention ? 'border-red-400' : 'border-teal-600'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-600">📦 {order.code}</span>
        <StatusBadge code={order.status} />
        {order.priority === 'URGENT' && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-medium text-white">🔥 Gấp</span>}
        <AttentionBadge reason={order.attention_reason} />
      </div>
      <div className="font-semibold">{order.goods}</div>
      <div className="text-sm text-slate-700">
        {order.weight_kg} kg · {order.packages} kiện · giao {fmtDay(order.delivery_at)}
      </div>
      {onOpen && <div className="text-sm text-teal-800">Bấm để xem, cập nhật trạng thái, nhắn riêng trong đơn →</div>}
    </button>
  )
}

/** Gắn ảnh đính kèm vào các message (message chữ không có ảnh thì để trống). */
async function withAttachments(msgs: Message[]): Promise<Message[]> {
  if (msgs.length === 0) return msgs
  const { data, error } = await sb()
    .from('message_attachments')
    .select('*')
    .in('message_id', msgs.map((m) => m.id))
    .order('position')
  if (error) throw error
  const by = new Map<number, Attachment[]>()
  for (const a of data as Attachment[]) by.set(a.message_id, [...(by.get(a.message_id) ?? []), a])
  return msgs.map((m) => (by.has(m.id) ? { ...m, attachments: by.get(m.id) } : m))
}

type Picked = { file: File; url: string }

/** Chat chung của group (orderId = null) hoặc chat riêng trong một đơn. */
export function Chat({ ctx, orderId, onOpenOrder }: { ctx: GroupCtx; orderId: string | null; onOpenOrder?: (id: string) => void }) {
  const [extra, setExtra] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [ordersTick, setOrdersTick] = useState(0)
  const [picked, setPicked] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const initial = useLoad(async () => {
    let q = sb().from('messages').select('*').eq('group_id', ctx.groupId)
    q = orderId ? q.eq('order_id', orderId) : q.is('order_id', null)
    const { data, error } = await q.order('id', { ascending: false }).limit(100)
    if (error) throw error
    return withAttachments((data as Message[]).reverse())
  }, [ctx.groupId, orderId])

  useRealtime(ctx.groupId, ['messages', 'orders'], (t, p) => {
    if (t === 'orders') {
      setOrdersTick((n) => n + 1)
      return
    }
    if (p.eventType !== 'INSERT') return
    const m = p.new as Message
    if ((m.order_id ?? null) !== orderId) return
    // Message tới trước ảnh: tải attachments rồi mới hiện (RPC cùng giao dịch nên ảnh đã có).
    void withAttachments([m])
      .catch(() => [m])
      .then(([mm]) => setExtra((x) => (x.some((y) => y.id === mm.id) ? x : [...x, mm])))
  })

  const all = [...(initial.data ?? [])]
  for (const m of extra) if (!all.some((y) => y.id === m.id)) all.push(m)

  // Thẻ đơn lấy trạng thái trực tiếp từ đơn thật (không sao chép vào tin nhắn).
  const cardIds = [...new Set(all.map((m) => m.shared_order_id).filter((x): x is string => !!x))].sort()
  const cards = useLoad(async () => {
    if (cardIds.length === 0) return new Map<string, Order>()
    const { data, error } = await sb().from('orders_view').select('*').in('id', cardIds)
    if (error) throw error
    return new Map((data as Order[]).map((o) => [o.id, o]))
  }, [cardIds.join(','), ordersTick])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [all.length])

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    const imgs = [...files].filter((f) => f.type.startsWith('image/'))
    const { list, dropped } = takeImages(picked.map((p) => p.file), imgs)
    const next = list.map((file, i) => (i < picked.length ? picked[i] : { file, url: URL.createObjectURL(file) }))
    setPicked(next)
    setErr(dropped > 0 ? `Mỗi lần gửi tối đa ${MAX_IMAGES} ảnh, đã bỏ ${dropped} ảnh thừa.` : '')
    if (fileInput.current) fileInput.current.value = ''
  }

  function unpick(i: number) {
    URL.revokeObjectURL(picked[i].url)
    setPicked(picked.filter((_, k) => k !== i))
  }

  async function send() {
    const text = body.trim()
    if (busy) return
    if (picked.length > 0) {
      setErr('')
      setBusy(true)
      try {
        const done = []
        for (const p of picked) done.push(await compressImage(p.file))
        const up = await uploadChatImages(ctx.groupId, done)
        await sendMessageWithImages(ctx.groupId, orderId, text, up)
        for (const p of picked) URL.revokeObjectURL(p.url)
        setPicked([])
        setBody('')
      } catch (e) {
        // Chưa tạo message nào; ảnh đã tải (nếu có) bỏ lại trong Storage.
        setErr(`Gửi ảnh thất bại, chưa gửi gì. ${errText(e)}`)
      } finally {
        setBusy(false)
      }
      return
    }
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
            {m.shared_order_id ? (
              <OrderCard order={cards.data?.get(m.shared_order_id)} loading={cards.loading} onOpen={onOpenOrder} />
            ) : (
              <>
                {m.attachments && m.attachments.length > 0 && (
                  <div className={m.sender_id === ctx.me ? 'flex flex-col items-end gap-1' : 'flex flex-col items-start gap-1'}>
                    <AlbumGrid attachments={m.attachments} />
                  </div>
                )}
                {m.body && <div className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-left ${m.sender_id === ctx.me ? 'bg-teal-100' : 'bg-white'}`}>{m.body}</div>}
              </>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((p, i) => (
            <div key={p.url} className="relative h-16 w-16 overflow-hidden rounded-md bg-slate-200">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label="Bỏ ảnh này" disabled={busy} onClick={() => unpick(i)} className="absolute right-0 top-0 h-6 w-6 rounded-bl-md bg-black/60 text-white">
                ×
              </button>
            </div>
          ))}
          <span className="self-center text-sm text-slate-600">
            {picked.length}/{MAX_IMAGES} ảnh{busy ? ' · đang nén và tải lên…' : ''}
          </span>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
        <Button aria-label="Đính kèm ảnh" disabled={busy} onClick={() => fileInput.current?.click()}>
          📎
        </Button>
        <input className={inputClass} maxLength={2000} placeholder={picked.length ? 'Chú thích (tuỳ chọn)…' : 'Nhập tin nhắn…'} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" kind="primary" disabled={busy || (!body.trim() && picked.length === 0)}>
          {busy ? 'Đang gửi…' : 'Gửi'}
        </Button>
      </form>
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  )
}
