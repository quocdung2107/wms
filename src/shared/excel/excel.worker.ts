/// <reference lib="webworker" />
import {
  buildColumns, detectHeader, extractRows, extractTable, readWorkbook,
  type Column, type ExtractResult, type HeaderInfo, type Mapping, type SheetData, type TableData,
} from './reader.ts'

// Giữ workbook trong worker; giao diện chỉ nhận kết quả đã xử lý.
let sheets: SheetData[] = []

export type SheetSummary = { name: string; rows: number }
export type InspectResult = { info: HeaderInfo; columns: Column[] }

export type ExcelRequest =
  | { id: number; op: 'open'; buffer: ArrayBuffer }
  | { id: number; op: 'inspect'; sheet: string; info?: HeaderInfo }
  | { id: number; op: 'extract'; sheet: string; info: HeaderInfo; mapping: Mapping }
  | { id: number; op: 'table'; sheet: string; info: HeaderInfo }
export type ExcelResponse =
  | { id: number; result: SheetSummary[] | InspectResult | ExtractResult | TableData }
  | { id: number; error: string }

const find = (name: string) => {
  const s = sheets.find((x) => x.name === name)
  if (!s) throw new Error(`Không thấy sheet "${name}"`)
  return s
}

self.onmessage = (e: MessageEvent<ExcelRequest>) => {
  const m = e.data
  try {
    let result: SheetSummary[] | InspectResult | ExtractResult | TableData
    switch (m.op) {
      case 'open':
        sheets = readWorkbook(m.buffer)
        result = sheets.map((s) => ({ name: s.name, rows: s.matrix.length }))
        break
      case 'inspect': {
        const s = find(m.sheet)
        const info = m.info ?? detectHeader(s.matrix)
        result = { info, columns: buildColumns(s, info) }
        break
      }
      case 'extract':
        result = extractRows(find(m.sheet), m.info, m.mapping)
        break
      case 'table':
        result = extractTable(find(m.sheet), m.info)
        break
    }
    postMessage({ id: m.id, result } satisfies ExcelResponse)
  } catch (err) {
    postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) } satisfies ExcelResponse)
  }
}
