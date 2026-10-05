import { useMemo } from 'react'
import { Notice, useLoad, usePersisted } from '../ui/ui.tsx'
import { getRows, getUomMap, listSources, type Source } from './repo.ts'
import { makeUomLabeler } from './uom.ts'
import type { InvRow } from './sheet.ts'

/** Chọn nguồn (nhớ lựa chọn) và nạp dòng của nguồn đó. */
export function useSourceRows(storageKey: string) {
  const sources = useLoad(listSources, [])
  const [sel, setSel] = usePersisted<{ id: number }>(storageKey, { id: 0 })
  const list = sources.data ?? []
  const source: Source | undefined = list.find((s) => s.id === sel.id) ?? list[0]
  const rows = useLoad<InvRow[]>(() => (source ? getRows(source.id) : Promise.resolve([])), [source?.id, source?.loaded_at])
  const uomMap = useLoad(getUomMap, [])
  const uomOf = useMemo(() => makeUomLabeler(uomMap.data ?? {}), [uomMap.data])
  return {
    sources: list,
    source,
    setSourceId: (id: number) => setSel({ id }),
    rows: rows.data ?? [],
    uomOf,
    loading: sources.loading || rows.loading,
    error: sources.error || rows.error,
    noData: !sources.loading && list.length === 0,
  }
}

export function NoDataNotice() {
  return (
    <Notice kind="warn">
      Chưa có dữ liệu. Vào <a className="font-semibold underline" href="#/data">Nạp dữ liệu</a> để nạp file Excel
      trước.
    </Notice>
  )
}
