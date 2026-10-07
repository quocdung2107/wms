import { useState } from 'react'
import { supabase } from '../../shared/supabase/client'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { DevLogin } from './DevLogin' // TẠM: xoá cùng DevLogin.tsx

/** Đăng nhập bằng mã OTP (6–8 số) gửi qua email (SMS làm sau). */
export function LoginForm() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    setBusy(false)
    if (e) setError(e.status === 429 ? 'Gửi quá nhiều lần, thử lại sau ít phút.' : 'Không gửi được mã. Kiểm tra email rồi thử lại.')
    else setSent(true)
  }

  async function verify() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (e) setError(e.status === 429 ? 'Thử quá nhiều lần, chờ ít phút.' : 'Mã sai hoặc đã hết hạn. Dùng mã trong email mới nhất.')
  }

  return (
    <>
    <Card className="mx-auto max-w-md space-y-4">
      <p className="text-slate-700">Đăng nhập để dùng Đơn hàng. Công cụ kho không cần đăng nhập.</p>
      {!sent ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <Field label="Email">
            <input type="email" required autoComplete="email" inputMode="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button kind="primary" type="submit" disabled={busy || !email} className="w-full">
            Gửi mã đăng nhập
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <Notice>Đã gửi mã tới {email}. Mã có hiệu lực ngắn.</Notice>
          <Field label="Mã trong email">
            <input
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6,8}"
              maxLength={8}
              className={`${inputClass} tracking-widest`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button kind="primary" type="submit" disabled={busy || code.length < 6} className="w-full">
            Đăng nhập
          </Button>
          <Button
            onClick={() => {
              setSent(false)
              setCode('')
              setError('')
            }}
            className="w-full"
          >
            Dùng email khác
          </Button>
        </form>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Card>
    {import.meta.env.DEV && <DevLogin />} {/* TẠM */}
    </>
  )
}
