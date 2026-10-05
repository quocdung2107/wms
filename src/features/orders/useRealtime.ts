import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useEffect, useRef } from 'react'
import { sb } from './api'

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>

/** Nghe thay đổi của các bảng trong một group (Realtime tuân theo RLS). */
export function useRealtime(groupId: string, tables: string[], onChange: (table: string, p: Payload) => void) {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  })
  const key = tables.join(',')
  useEffect(() => {
    const ch = sb().channel(`g:${groupId}:${key}:${Math.random().toString(36).slice(2, 8)}`)
    for (const t of key.split(',')) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `group_id=eq.${groupId}` }, (p) => cb.current(t, p))
    }
    ch.subscribe()
    return () => {
      void sb().removeChannel(ch)
    }
  }, [groupId, key])
}
