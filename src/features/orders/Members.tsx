import { useState } from 'react'
import { Button, Card, Field, inputClass, Notice } from '../../shared/ui/ui'
import { errText, rpc } from './api'
import { ROLES, roleLabel, type GroupCtx } from './types'

function RoleBoxes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {ROLES.map((r) => (
        <label key={r.code} className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={value.includes(r.code)}
            onChange={(e) => onChange(e.target.checked ? [...value, r.code] : value.filter((x) => x !== r.code))}
          />
          {r.label}
        </label>
      ))}
    </div>
  )
}

export function Members({ ctx }: { ctx: GroupCtx }) {
  const [ident, setIdent] = useState('')
  const [roles, setRoles] = useState<string[]>(['operator'])
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null)
    try {
      await fn()
      setMsg({ kind: 'info', text: ok })
      ctx.reloadMembers()
      return true
    } catch (e) {
      setMsg({ kind: 'error', text: errText(e) })
      return false
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Thành viên ({ctx.members.length})</h2>
        <ul className="divide-y divide-slate-100">
          {ctx.members.map((m) => (
            <li key={m.user_id} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {m.name}
                  {m.user_id === ctx.me && <span className="text-slate-500"> (bạn)</span>}
                </span>
                {ctx.isAdmin && (
                  <Button
                    kind="danger"
                    onClick={() => {
                      if (window.confirm(`Bỏ ${m.name} khỏi group?`)) void run(() => rpc('remove_member', { p_group: ctx.groupId, p_user: m.user_id }), 'Đã bỏ thành viên.')
                    }}
                  >
                    Bỏ
                  </Button>
                )}
              </div>
              {ctx.isAdmin ? (
                <RoleBoxes value={m.roles} onChange={(v) => void run(() => rpc('set_member_roles', { p_group: ctx.groupId, p_user: m.user_id, p_roles: v }), 'Đã lưu vai trò.')} />
              ) : (
                <p className="text-sm text-slate-600">{m.roles.length ? m.roles.map(roleLabel).join(', ') : 'Chưa có vai trò (chỉ xem và nhắn tin)'}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {ctx.isAdmin && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => rpc('add_member', { p_group: ctx.groupId, p_identifier: ident, p_roles: roles }), 'Đã thêm thành viên.').then((ok) => ok && setIdent(''))
            }}
          >
            <h2 className="text-lg font-semibold">Thêm thành viên</h2>
            <Field label="Email hoặc số điện thoại (người đó đã đăng nhập app ít nhất một lần)">
              <input className={inputClass} required value={ident} onChange={(e) => setIdent(e.target.value)} />
            </Field>
            <RoleBoxes value={roles} onChange={setRoles} />
            <Button type="submit" kind="primary" disabled={!ident.trim()}>
              Thêm
            </Button>
          </form>
        </Card>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  )
}
