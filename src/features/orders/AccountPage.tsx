import { useState } from 'react'
import { supabase } from '../../shared/supabase/client'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { LoginForm } from './LoginForm'
import { useSession } from './useSession'

/** Tab Tôi: tên hiển thị + đăng xuất. */
export default function AccountPage() {
  const session = useSession()
  if (!supabase) return <Notice kind="warn">Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Notice>
  if (session === undefined) return <p className="text-slate-600">Đang kiểm tra đăng nhập…</p>
  if (!session) return <LoginForm />
  return <Account userId={session.user.id} email={session.user.email ?? ''} />
}

function Account({ userId, email }: { userId: string; email: string }) {
  const profile = useLoad(async () => {
    const { data, error } = await supabase!.from('profiles').select('display_name').eq('id', userId).single()
    if (error) throw error
    return data.display_name as string
  }, [userId])
  const [name, setName] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const shown = name ?? profile.data ?? ''

  async function save() {
    const { error } = await supabase!.from('profiles').update({ display_name: shown.trim() }).eq('id', userId)
    setMsg(error ? 'Không lưu được tên.' : 'Đã lưu.')
  }

  return (
    <Card className="mx-auto max-w-md space-y-4">
      <p className="text-slate-700">
        Đang đăng nhập: <b>{email}</b>
      </p>
      {profile.error && <Notice kind="error">Không tải được hồ sơ.</Notice>}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Tên hiển thị (thành viên khác thấy tên này)">
          <input className={inputClass} maxLength={60} value={shown} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button kind="primary" type="submit" disabled={!shown.trim()} className="w-full">
          Lưu tên
        </Button>
      </form>
      {msg && <Notice>{msg}</Notice>}
      <Button onClick={() => void supabase!.auth.signOut()} className="w-full">
        Đăng xuất
      </Button>
    </Card>
  )
}
