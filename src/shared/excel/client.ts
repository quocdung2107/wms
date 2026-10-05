import type { ExcelRequest, ExcelResponse, InspectResult, SheetSummary } from './excel.worker.ts'
import { suggestMapping, type ExtractResult, type HeaderInfo, type Mapping, type TableData } from './reader.ts'

let worker: Worker | null = null
const pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>()
let nextId = 1

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ExcelResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if ('error' in e.data) p.reject(new Error(e.data.error))
      else p.resolve(e.data.result as never)
    }
  }
  return worker
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never

function call<T>(req: Distribute<ExcelRequest>, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve: resolve as (v: never) => void, reject })
    getWorker().postMessage({ ...req, id }, transfer)
  })
}

export const excel = {
  open: (buffer: ArrayBuffer) => call<SheetSummary[]>({ op: 'open', buffer }, [buffer]),
  inspect: (sheet: string, info?: HeaderInfo) => call<InspectResult>({ op: 'inspect', sheet, info }),
  extract: (sheet: string, info: HeaderInfo, mapping: Mapping) =>
    call<ExtractResult>({ op: 'extract', sheet, info, mapping }),
  table: (sheet: string, info: HeaderInfo) => call<TableData>({ op: 'table', sheet, info }),
}

/** Sheet dữ liệu chính: nhiều cột nhận ra được nhất (sheet master/phụ ít cột khớp), hoà thì nhiều dòng hơn. */
export async function bestSheet(sheets: SheetSummary[]): Promise<string> {
  let best = sheets[0].name
  let bestScore = -1
  for (const s of sheets) {
    const r = await excel.inspect(s.name)
    const score = Object.keys(suggestMapping(r.columns)).length * 100000 + s.rows
    if (score > bestScore) {
      best = s.name
      bestScore = score
    }
  }
  return best
}
