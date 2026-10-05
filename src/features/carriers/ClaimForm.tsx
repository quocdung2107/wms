import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { carrierErr, claimCarrier } from './api'
import type { Carrier } from './types'

/** Gửi yêu cầu claim cho carrier chưa có chủ; admin hệ thống duyệt. */
export function ClaimForm({ carrier, onDone, onCancel }: { carrier: Carrier; onDone: (msg: string) => void; onCancel: () => void }) {
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setErr('')
    try {
      await claimCarrier(carrier.id, contact.trim(), note.trim())
      onDone('Đã gửi yêu cầu claim. Admin sẽ duyệt và liên hệ qua thông tin bạn cung cấp.')
    } catch (e) {
      setErr(carrierErr(e))
    }
    setBusy(false)
  }

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="text-lg font-semibold">Claim: {carrier.name}</h2>
        <Notice>Gửi SĐT hoặc email công ty để admin xác minh bạn là chủ nhà vận tải này.</Notice>
        <Field label="SĐT / email công ty *">
          <input className={inputClass} required maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <textarea className={inputClass} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button kind="primary" type="submit" disabled={busy || !contact.trim()}>Gửi yêu cầu</Button>
          <Button onClick={onCancel}>Huỷ</Button>
        </div>
      </form>
    </Card>
  )
}
