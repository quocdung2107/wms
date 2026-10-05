import { useState } from 'react'
import { supabase } from '../../shared/supabase/client'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui'
import { errText, rpc, sb } from './api'
import { GroupView } from './GroupView'
import { LoginForm } from './LoginForm'
import { useSession } from './useSession'

const KEY = 'wa.group'
const saved = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export default function OrdersPage() {
  const session = useSession()
  if (!supabase) return <Notice kind="warn">Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Notice>
  if (session === undefined) return <p className="text-slate-600">Đang kiểm tra đăng nhập…</p>
  if (!session) return <LoginForm />
  return <Groups me={session.user.id} />
}

type G = { id: string; name: string }

function Groups({ me }: { me: string }) {
  const [sel, setSel] = useState(saved)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const groups = useLoad(async () => {
    const { data, error } = await sb().from('groups').select('id,name').order('created_at', { ascending: true })
    if (error) throw error
    return data as G[]
  }, [])

  function pick(id: string) {
    setSel(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* bỏ qua */
    }
  }

  async function create() {
    setErr('')
    try {
      const id = (await rpc('create_group', { p_name: name })) as string
      setName('')
      setCreating(false)
      groups.reload()
      pick(id)
    } catch (e) {
      setErr(errText(e))
    }
  }

  if (groups.error) return <Notice kind="error">Không tải được danh sách group.</Notice>
  if (!groups.data) return <p className="text-slate-600">Đang tải…</p>
  const list = groups.data
  const current = list.find((g) => g.id === sel) ?? list[0]

  return (
    <div className="space-y-4">
      {list.length === 0 && <Notice>Bạn chưa thuộc group nào. Nhờ admin group thêm email của bạn, hoặc tạo group mới cho team.</Notice>}
      <div className="flex flex-wrap items-end gap-2">
        {current && (
          <div className="min-w-48 flex-1">
            <Field label="Group">
              <select className={inputClass} value={current.id} onChange={(e) => pick(e.target.value)}>
                {list.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Button onClick={() => setCreating((c) => !c)}>{creating ? 'Đóng' : '+ Tạo group'}</Button>
      </div>

      {creating && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <Field label="Tên group (mỗi team một group). Bạn sẽ là admin.">
              <input className={inputClass} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" kind="primary" disabled={!name.trim()}>
              Tạo group
            </Button>
            {err && <Notice kind="error">{err}</Notice>}
          </form>
        </Card>
      )}

      {current && <GroupView key={current.id} groupId={current.id} me={me} />}
    </div>
  )
}
