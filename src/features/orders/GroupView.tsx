import { useState } from 'react'
import { Notice, useLoad } from '../../shared/ui/ui'
import { Board } from './Board'
import { NewOrderForm } from './NewOrderForm'
import { OrderDetail } from './OrderDetail'
import { Chat } from './Chat'
import { sb } from './api'
import { Members } from './Members'
import type { GroupCtx, Member } from './types'
import { Card } from '../../shared/ui/ui'

const VIEWS = [
  { id: 'chat', label: '💬 Chat' },
  { id: 'new', label: '➕ Tạo đơn' },
  { id: 'orders', label: '📦 Đơn hàng' },
  { id: 'members', label: '👥 Thành viên' },
] as const

async function loadMembers(groupId: string): Promise<Member[]> {
  const ms = await sb().from('group_members').select('user_id,roles').eq('group_id', groupId)
  if (ms.error) throw ms.error
  const ids = ms.data.map((m) => m.user_id as string)
  const ps = await sb().from('profiles').select('id,display_name').in('id', ids)
  if (ps.error) throw ps.error
  const names = new Map(ps.data.map((p) => [p.id as string, (p.display_name as string) || 'Thành viên']))
  return ms.data.map((m) => ({ user_id: m.user_id as string, roles: m.roles as string[], name: names.get(m.user_id as string) ?? 'Thành viên' }))
}

export function GroupView({ groupId, me }: { groupId: string; me: string }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('chat')
  const [openId, setOpenId] = useState<string | null>(null)
  const members = useLoad(() => loadMembers(groupId), [groupId])

  if (members.error) return <Notice kind="error">Không tải được thành viên group.</Notice>
  if (!members.data) return <p className="text-slate-600">Đang tải…</p>
  const mine = members.data.find((m) => m.user_id === me)
  if (!mine) return <Notice kind="warn">Bạn không còn trong group này.</Notice>

  const ctx: GroupCtx = {
    groupId,
    me,
    roles: mine.roles,
    members: members.data,
    nameOf: (id) => (id ? (members.data!.find((m) => m.user_id === id)?.name ?? 'Người đã rời group') : 'chưa giao'),
    isAdmin: mine.roles.includes('admin'),
    canCoordinate: mine.roles.includes('admin') || mine.roles.includes('coordinator'),
    canWork: mine.roles.length > 0,
    reloadMembers: members.reload,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {VIEWS.filter((v) => v.id !== 'new' || ctx.canCoordinate).map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => {
              setView(v.id)
              setOpenId(null)
            }}
            className={`min-h-11 rounded-lg border px-4 text-base ${view === v.id ? 'border-teal-700 bg-teal-50 font-semibold' : 'border-slate-300 bg-white'}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {!ctx.canWork && <Notice kind="info">Bạn chưa có vai trò trong group: chỉ xem đơn và nhắn tin. Nhờ admin gán vai trò.</Notice>}
      {view === 'chat' && openId && <OrderDetail key={openId} ctx={ctx} orderId={openId} onClose={() => setOpenId(null)} backLabel="← Về chat" backAlways />}
      {view === 'chat' && !openId && (
        <Card>
          <Chat ctx={ctx} orderId={null} onOpenOrder={setOpenId} />
        </Card>
      )}
      {view === 'new' && ctx.canCoordinate && (
        <NewOrderForm
          ctx={ctx}
          onCreated={(id) => {
            setView('chat')
            setOpenId(id)
          }}
        />
      )}
      {view === 'orders' && <Board ctx={ctx} />}
      {view === 'members' && <Members ctx={ctx} />}
    </div>
  )
}
