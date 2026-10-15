import { useState } from 'react'
import { customerKey, type Customer } from '../../../shared/inventory/customers.ts'
import { listCustomers } from '../../../shared/inventory/repo.ts'
import { Button, Card, Field, inputClass, Notice, printPage, useLoad, usePersisted } from '../../../shared/ui/ui.tsx'

type LineKey = 'name' | 'address' | 'contact' | 'phone' | 'note'
// Prefs phẳng (usePersisted merge nông). Key riêng, không đụng wa.label.prefs.
type Prefs = { code: string; note: string } & Record<`${LineKey}Size`, number> & Record<`${LineKey}Bold`, boolean>
const DEFAULT_PREFS: Prefs = {
  code: '', note: '',
  nameSize: 40, addressSize: 28, contactSize: 28, phoneSize: 32, noteSize: 24,
  nameBold: true, addressBold: false, contactBold: false, phoneBold: true, noteBold: false,
}
const SIZES = [14, 18, 24, 28, 32, 40, 48, 60]
const LINES: { k: LineKey; label: string }[] = [
  { k: 'name', label: 'Tên khách' },
  { k: 'address', label: 'Địa chỉ giao hàng' },
  { k: 'contact', label: 'Người liên hệ' },
  { k: 'phone', label: 'SĐT' },
  { k: 'note', label: 'Ghi chú' },
]

/** Địa chỉ giao hàng; trống thì dùng địa chỉ chung. */
const addressOf = (c: Customer) => c.delivery_address.trim() || c.address.trim()
const phoneOf = (c: Customer) => [c.phone1, c.phone2].map((p) => p.trim()).filter(Boolean).join(' / ')

export default function AddressTab() {
  const list = useLoad(listCustomers, [])
  const [prefs, setPrefs] = usePersisted<Prefs>('wa.label.address', DEFAULT_PREFS)
  const [q, setQ] = useState('')
  const customers = list.data ?? []
  const customer = prefs.code ? customers.find((c) => customerKey(c.code) === customerKey(prefs.code)) : undefined
  const needle = q.trim().toLowerCase()
  const matches = needle
    ? customers.filter((c) => `${c.code} ${c.name} ${c.short_name}`.toLowerCase().includes(needle)).slice(0, 50)
    : customers.slice(0, 50)

  const address = customer ? addressOf(customer) : ''
  const lines: { k: LineKey; text: string }[] = customer
    ? ([
        { k: 'name', text: customer.name },
        { k: 'address', text: address },
        { k: 'contact', text: customer.contact.trim() },
        { k: 'phone', text: phoneOf(customer) },
        { k: 'note', text: prefs.note.trim() },
      ] as { k: LineKey; text: string }[]).filter((l) => l.text)
    : []
  const noAddress = !!customer && !address
  const canPrint = !!customer && !noAddress

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tìm khách (mã / tên)">
              <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ mã hoặc tên…" />
            </Field>
            <Field label="Khách hàng">
              <select className={inputClass} value={customer?.code ?? ''} onChange={(e) => setPrefs((p) => ({ ...p, code: e.target.value }))}>
                <option value="">— Chọn khách —</option>
                {customer && !matches.includes(customer) && <option value={customer.code}>{customer.code} · {customer.name}</option>}
                {matches.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
              </select>
            </Field>
          </div>
          {list.loading && <p className="text-slate-600">Đang tải danh sách khách…</p>}
          {list.error && <Notice kind="error">{list.error}</Notice>}
          {!list.loading && !list.error && customers.length === 0 && <Notice kind="warn">Chưa có khách hàng nào. Thêm khách ở mục Khách hàng.</Notice>}
          {prefs.code && !customer && !list.loading && <Notice kind="warn">Khách đã chọn ({prefs.code}) không còn trong danh sách. Hãy chọn lại.</Notice>}
          {noAddress && <Notice kind="warn">Khách này chưa có Địa chỉ giao hàng lẫn Địa chỉ. Bổ sung ở mục Khách hàng trước khi in.</Notice>}
          <Field label="Ghi chú (tuỳ chọn, in thành một dòng)">
            <input className={inputClass} value={prefs.note} onChange={(e) => setPrefs((p) => ({ ...p, note: e.target.value }))} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LINES.map(({ k, label }) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <span className="w-32 text-sm font-medium text-slate-700">{label}</span>
                <select aria-label={`Cỡ chữ ${label}`} className={`${inputClass} !w-24`} value={prefs[`${k}Size`]} onChange={(e) => setPrefs((p) => ({ ...p, [`${k}Size`]: Number(e.target.value) }))}>
                  {SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
                </select>
                <label className="flex min-h-9 items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-4" checked={prefs[`${k}Bold`]} onChange={(e) => setPrefs((p) => ({ ...p, [`${k}Bold`]: e.target.checked }))} />
                  Đậm
                </label>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="primary" disabled={!canPrint} onClick={() => printPage('portrait')}>In A4 / Lưu PDF</Button>
            <span className="text-slate-600">1 nhãn · 1 trang</span>
          </div>
        </Card>
        {!customer && <Notice kind="warn">Chưa chọn khách.</Notice>}
        <p className="text-sm text-slate-500">Xem trước thu nhỏ. Khi in chọn khổ A4 dọc, tỉ lệ 100%, lề mặc định.</p>
      </div>

      {canPrint && (
        <div className="label-sheet mx-auto bg-white shadow-sm [zoom:0.4] sm:[zoom:0.7] lg:[zoom:0.9] print:shadow-none print:[zoom:1]" style={{ width: '194mm', height: '279mm' }}>
          <div className="flex h-full flex-col justify-center gap-[6mm] overflow-hidden border border-dashed border-slate-400 p-[10mm] leading-tight">
            {lines.map((l) => (
              <p key={l.k} className="break-words" style={{ fontSize: `${prefs[`${l.k}Size`]}pt`, fontWeight: prefs[`${l.k}Bold`] ? 800 : 400 }}>
                {l.k === 'phone' ? `ĐT: ${l.text}` : l.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
