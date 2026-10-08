import { useRef, useState } from 'react'
import { Button, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { errText, rpc, sb, sendMessageWithImages, uploadChatImages } from './api'
import { compressImage, MAX_IMAGES, takeImages } from './imageUtils'
import type { GroupCtx, Order } from './types'

type Picked = { file: File; url: string }
type Mode = 'message' | 'note'

/** Chọn đơn đích cho Order Note ở chat chung: đơn chưa COMPLETED của group. */
function NoteTarget({ groupId, value, onChange }: { groupId: string; value: string; onChange: (id: string) => void }) {
  const orders = useLoad(async () => {
    const { data, error } = await sb().from('orders_view').select('id,code,goods').eq('group_id', groupId).neq('status', 'COMPLETED').order('last_activity_at', { ascending: false }).limit(200)
    if (error) throw error
    return data as Pick<Order, 'id' | 'code' | 'goods'>[]
  }, [groupId])
  if (orders.error) return <Notice kind="error">Không tải được danh sách đơn.</Notice>
  return (
    <select className={inputClass} aria-label="Đơn cần ghi chú" value={value} onChange={(e) => onChange(e.target.value)} disabled={orders.loading}>
      <option value="">{orders.loading ? 'Đang tải đơn…' : (orders.data?.length ?? 0) === 0 ? 'Không có đơn đang mở' : 'Chọn đơn…'}</option>
      {(orders.data ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.code} · {o.goods}
        </option>
      ))}
    </select>
  )
}

/** Ô soạn: Message (chữ + ảnh, tạo message) hoặc Order Note (add_note, không tạo message). */
export function Composer({ ctx, orderId }: { ctx: GroupCtx; orderId: string | null }) {
  const [mode, setMode] = useState<Mode>('message')
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const note = mode === 'note'
  const noteOrder = orderId ?? target

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

  async function sendNote() {
    const text = body.trim()
    if (busy || !text || !noteOrder) return
    setErr('')
    setInfo('')
    setBusy(true)
    try {
      await rpc('add_note', { p_order: noteOrder, p_note: text })
      setBody('')
      setInfo('Đã thêm ghi chú vào timeline đơn.')
    } catch (e) {
      const m = String((e as { message?: string } | null)?.message ?? '')
      setErr(m.includes('forbidden') ? 'Bạn không có vai trò để ghi chú đơn này.' : errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (note) return sendNote()
    const text = body.trim()
    if (busy) return
    setInfo('')
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

  function modeBtn(m: Mode, label: string) {
    return (
      <button
        type="button"
        aria-pressed={mode === m}
        onClick={() => {
          setMode(m)
          setErr('')
          setInfo('')
        }}
        className={`min-h-11 flex-1 rounded-md px-3 font-medium ${mode === m ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {modeBtn('message', 'Message')}
        {modeBtn('note', 'Order Note')}
      </div>
      {!note && picked.length > 0 && (
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
      {note && orderId === null && <NoteTarget groupId={ctx.groupId} value={target} onChange={setTarget} />}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
        <Button aria-label="Đính kèm ảnh" disabled={busy || note} onClick={() => fileInput.current?.click()}>
          📎
        </Button>
        <input
          className={inputClass}
          maxLength={note ? 1000 : 2000}
          placeholder={note ? 'Ghi chú vào timeline đơn…' : picked.length ? 'Chú thích (tuỳ chọn)…' : 'Nhập tin nhắn…'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" kind="primary" disabled={busy || (note ? !body.trim() || !noteOrder : !body.trim() && picked.length === 0)}>
          {busy ? 'Đang gửi…' : note ? 'Ghi chú' : 'Gửi'}
        </Button>
      </form>
      {info && <Notice kind="info">{info}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  )
}
