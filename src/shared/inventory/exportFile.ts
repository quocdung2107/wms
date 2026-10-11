import { downloadBlob } from '../ui/ui.tsx'

export async function exportRows(
  aoa: (string | number | boolean | Date | null | undefined)[][],
  base: string,
  kind: 'xlsx' | 'csv',
) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const stamp = new Date().toISOString().slice(0, 10)
  if (kind === 'csv') {
    downloadBlob(`${base}-${stamp}.csv`, '﻿' + XLSX.utils.sheet_to_csv(ws), 'text/csv;charset=utf-8')
  } else {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    downloadBlob(`${base}-${stamp}.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }
}
