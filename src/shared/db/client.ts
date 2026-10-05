import type { DbRequest, DbResponse, Statement } from './db.worker.ts'

export type Row = Record<string, unknown>
type Pending = { resolve: (rows: Row[]) => void; reject: (e: Error) => void }
type Bind = DbRequest['bind']

const worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' })
const pending = new Map<number, Pending>()
let nextId = 1

export const dbReady = new Promise<{ persistent: boolean; reason?: string }>((resolve, reject) => {
  worker.addEventListener('message', (e: MessageEvent<DbResponse>) => {
    const m = e.data
    if ('ready' in m) {
      if (m.ready) resolve({ persistent: m.persistent, reason: m.reason })
      else reject(new Error(m.error))
      return
    }
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    if ('error' in m) p.reject(new Error(m.error))
    else p.resolve(m.rows)
  })
})

function send(req: Omit<DbRequest, 'id'>): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...req, id } satisfies DbRequest)
  })
}

export const query = (sql: string, bind?: Bind) => send({ sql, bind })
/** Nhiều câu lệnh trong một giao dịch (hoặc cả hai, hoặc không câu nào). */
export const batch = (statements: Statement[]) => send({ batch: statements })
