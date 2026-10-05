import { useState, type ReactNode } from 'react'
import { Button, Field, inputClass, Notice } from '../../shared/ui/ui'
import { errText } from './api'

/** Một hành động có ô ghi chú: gọi onSubmit(note), hiện lỗi tiếng Việt nếu RPC từ chối. */
export function NoteAction({
  label,
  button,
  placeholder,
  required = false,
  kind = 'secondary',
  confirmText,
  onSubmit,
  children,
}: {
  label: string
  button: string
  placeholder?: string
  required?: boolean
  kind?: 'primary' | 'secondary' | 'danger'
  confirmText?: string
  onSubmit: (note: string) => Promise<unknown>
  children?: ReactNode
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setErr('')
    try {
      await onSubmit(note.trim())
      setNote('')
    } catch (e) {
      setErr(errText(e))
    }
    setBusy(false)
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      {children}
      <Field label={label}>
        <input className={inputClass} maxLength={1000} placeholder={placeholder} required={required} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" kind={kind} disabled={busy} className="w-full sm:w-auto">
        {button}
      </Button>
      {err && <Notice kind="error">{err}</Notice>}
    </form>
  )
}
