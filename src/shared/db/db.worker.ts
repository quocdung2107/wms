/// <reference lib="webworker" />
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'

// Kho dữ liệu cục bộ: SQLite WASM lưu trong OPFS (VFS opfs-sahpool, không cần
// header COOP/COEP nên chạy được trên host tĩnh).
type Bind = (string | number | null)[]
export type Statement = { sql: string; bind?: Bind }
export type DbRequest = { id: number; sql?: string; bind?: Bind; batch?: Statement[] }
export type DbResponse =
  | { id: number; rows: Record<string, unknown>[] }
  | { id: number; error: string }
  | { ready: true; persistent: boolean; reason?: string }
  | { ready: false; error: string }

let db: Database | null = null
let reason: string | undefined

async function init() {
  const sqlite3 = await sqlite3InitModule()
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ directory: '/warehouse-assistant' })
    db = new pool.OpfsSAHPoolDb('/kho.sqlite3')
    return true
  } catch (e) {
    reason = String(e)
    db = new sqlite3.oo1.DB(':memory:')
    return false
  }
}

const ready = init()

self.onmessage = async (e: MessageEvent<DbRequest>) => {
  const { id, sql, bind, batch } = e.data
  try {
    await ready
    if (batch) {
      db!.exec('BEGIN')
      try {
        for (const s of batch) db!.exec({ sql: s.sql, bind: s.bind })
        db!.exec('COMMIT')
      } catch (err) {
        db!.exec('ROLLBACK')
        throw err
      }
      postMessage({ id, rows: [] } satisfies DbResponse)
      return
    }
    const rows = db!.exec({ sql: sql!, bind, rowMode: 'object', returnValue: 'resultRows' })
    postMessage({ id, rows } satisfies DbResponse)
  } catch (err) {
    postMessage({ id, error: String(err) } satisfies DbResponse)
  }
}

ready.then(
  (persistent) => postMessage({ ready: true, persistent, reason } satisfies DbResponse),
  (err) => postMessage({ ready: false, error: String(err) } satisfies DbResponse),
)
