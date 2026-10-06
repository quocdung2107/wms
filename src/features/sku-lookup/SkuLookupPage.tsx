import { useEffect, useMemo, useState } from 'react'
import { NoDataNotice } from '../../shared/inventory/hooks.tsx'
import { getRowsBySku, getUomMap, listSources, searchSkus, type SkuHit, type SkuRow } from '../../shared/inventory/repo.ts'
import { flagOf, FLAG_TEXT, fmtDate, fmtQty } from '../../shared/inventory/sheet.ts'
import { makeUomLabeler } from '../../shared/inventory/uom.ts'
import { estimateStock, getPickedBySku, locKey } from '../../shared/inventory/history.ts'
import { Button, Card, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

import CountDrawer from './CountDrawer.tsx'
import HistoryPage from './HistoryPage.tsx'
import PickForm, { type LocTarget } from './PickForm.tsx'

export default function SkuLookupPage() {
  const sources = useLoad(listSources, [])
  const uomMap = useLoad(getUomMap, [])
  const uomOf = useMemo(() => makeUomLabeler(uomMap.data ?? {}), [uomMap.data])
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SkuHit[]>([])
  const [sku, setSku] = useState('')
  const [rows, setRows] = useState<SkuRow[] | null>(null)
  const [picked, setPicked] = useState<Map<string, number>>(new Map())
  const [showHistory, setShowHistory] = useState(false)
  const [panel, setPanel] = useState<{ kind: 'count' | 'pick'; target: LocTarget } | null>(null)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => searchSkus(term).then((h) => alive && setHits(h), () => {}), 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [term])

  async function show(code: string) {
    setSku(code)
    setTerm(code)
    setHits([])
    setPicked(await getPickedBySku(code).catch(() => new Map()))
    setRows(await getRowsBySku(code))
  }

  if (showHistory) return <HistoryPage onBack={() => { setShowHistory(false); if (sku) show(sku) }} />

  if (!sources.loading && (sources.data?.length ?? 0) === 0) return <NoDataNotice />

  const exact = hits.find((h) => h.sku.toLowerCase() === term.trim().toLowerCase())
  const total = (rows ?? []).reduce((s, r) => s + (r.qty_system ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button onClick={() => setShowHistory(true)}>Lịch sử</Button>
        <input
          className={`${inputClass} text-lg`}
          value={term}
          autoFocus
          autoComplete="off"
          inputMode="text"
          placeholder="Gõ SKU hoặc tên hàng"
          aria-label="SKU"
          onChange={(e) => {
            setTerm(e.target.value)
            setRows(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (exact || hits[0])) show((exact ?? hits[0]).sku)
          }}
        />
        {hits.length > 0 && !rows && (
          <ul className="overflow-hidden rounded-xl bg-white shadow-sm">
            {hits.map((h) => (
              <li key={h.sku}>
                <button type="button" className="block min-h-12 w-full border-b border-slate-100 px-3 py-2 text-left" onClick={() => show(h.sku)}>
                  <span className="font-semibold">{h.sku}</span>
                  <span className="block text-sm text-slate-600">{h.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {term.trim() && hits.length === 0 && !rows && <p className="text-slate-600">Không thấy SKU nào khớp.</p>}
      </div>

      {rows && (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <Notice kind="warn">Không có dòng nào cho SKU {sku}.</Notice>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold">{sku}</h2>
                <p className="text-slate-700">{rows[0].description}</p>
                <p className="text-slate-600">{rows.length} dòng · tổng SL hệ thống: <b>{fmtQty(total)}</b></p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => {
                  const f = flagOf(r.qty_system)
                  const bad = r.condition && r.condition.toUpperCase() !== 'GOOD'
                  const pk = picked.get(locKey(r.source, r.location, r.batch_no)) ?? 0
                  const target: LocTarget = {
                    sku, description: rows[0].description ?? '', source: r.source ?? '', location: r.location ?? '',
                    batch_no: r.batch_no ?? '', uom: uomOf(r.uom_raw), qtySystem: r.qty_system, picked: pk,
                  }
                  return (
                    <Card key={r.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-2xl font-bold">{r.location || '—'}</p>
                        <p className="text-right text-2xl font-bold">
                          {fmtQty(r.qty_system)} <span className="text-base font-normal">{uomOf(r.uom_raw)}</span>
                          {f && <span className="ml-1 rounded bg-amber-200 px-1 text-xs font-bold text-amber-900">{FLAG_TEXT[f]}</span>}
                        </p>
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-base">
                        {([
                          ['Batch', r.batch_no],
                          ['Ngày SX', fmtDate(r.manuf_date)],
                          ['Ngày nhập', fmtDate(r.receive_date)],
                          ['Hạn dùng', fmtDate(r.expiry_date)],
                          ['Tình trạng', r.condition],
                          ['Lot', r.lot_no],
                          ['Kho', r.warehouse],
                          ['Nguồn', r.source],
                        ] as const).map(([k, v]) =>
                          v ? (
                            <div key={k} className="contents">
                              <dt className="text-slate-500">{k}</dt>
                              <dd className={k === 'Tình trạng' && bad ? 'font-bold text-red-700' : 'font-medium'}>{v}</dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                      <p className="text-base">
                        Đã lấy: <b>{fmtQty(pk)}</b> · Tồn ước tính: <b>{fmtQty(estimateStock(r.qty_system, pk))}</b>
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button className="flex-1" onClick={() => setPanel({ kind: 'count', target })}>Kiểm</Button>
                        <Button className="flex-1" onClick={() => setPanel({ kind: 'pick', target })}>Lấy hàng</Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
      {panel?.kind === 'count' && <CountDrawer target={panel.target} onClose={() => setPanel(null)} onSaved={() => {}} />}
      {panel?.kind === 'pick' && (
        <PickForm target={panel.target} onClose={() => setPanel(null)} onSaved={() => getPickedBySku(sku).then(setPicked, () => {})} />
      )}
    </div>
  )
}
