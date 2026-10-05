// TẠM — chỉ để test khi Supabase giới hạn email OTP. Chỉ hiện khi chạy `npm run dev`
// (import.meta.env.DEV); bản build không có. XOÁ file này và 2 dòng DevLogin trong LoginForm.tsx khi test xong.
import { useState } from 'react'
import { supabase } from '../../shared/supabase/client'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'

export function DevLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function login() {
    setError('')
    const { error: e } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (e) setError(e.message)
  }

  return (
    <Card className="mx-auto max-w-md space-y-3 border-2 border-dashed border-amber-400">
      <p className="font-semibold text-amber-900">Chỉ để test (dev): đăng nhập bằng mật khẩu</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void login()
        }}
      >
        <Field label="Email">
          <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full">
          Đăng nhập (dev)
        </Button>
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Card>
  )
}
