import { useState } from 'react'
import { addCustomer, deleteCustomer, listCustomers, updateCustomer } from '../../shared/inventory/repo.ts'
import { normalizeCustomer, type Customer } from '../../shared/inventory/customers.ts'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

const LABELS: [keyof Customer, string][] = [
  ['code', 'Mã KH *'],
  ['name', 'Tên khách *'],
  ['short_name', 'Tên viết tắt'],
  ['address', 'Địa chỉ'],
  ['delivery_address', 'Địa chỉ giao hàng'],
  ['contact', 'Người liên hệ'],
  ['sup', 'Sup phụ trách'],
  ['phone1', 'SĐT 1'],
  ['phone2', 'SĐT 2'],
  ['note', 'Ghi chú'],
]

export default function CustomersPage() {
  const list = useLoad(listCustomers, [])
  // editing: null = đóng form; 'new' = thêm; còn lại = mã đang sửa
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Customer>(normalizeCustomer({}))
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const open = (c: Customer | null) => {
    setForm(c ?? normalizeCustomer({}))
    setEditing(c ? c.code : 'new')
    setError('')
  }

  async function save() {
    const err = editing === 'new' ? await addCustomer(form) : await updateCustomer(editing!, form)
    if (err) return setError(err)
    setEditing(null)
    list.reload()
  }

  async function remove(c: Customer) {
    if (!confirm(`Xoá khách "${c.name}" (${c.code})? Lệnh lấy hàng đang dùng mã này giữ nguyên mã chữ.`)) return
    await deleteCustomer(c.code)
    if (editing === c.code) setEditing(null)
    list.reload()
  }

  const needle = q.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (c) => !needle || [c.code, c.name, c.short_name, c.sup, c.phone1, c.phone2].some((v) => v.toLowerCase().includes(needle)),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputClass} flex-1 sm:max-w-sm`} placeholder="Tìm mã, tên, Sup, SĐT" aria-label="Tìm khách" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button kind="primary" onClick={() => open(null)}>Thêm khách</Button>
      </div>

      {editing && (
        <Card className="space-y-3">
          <h2 className="font-semibold">{editing === 'new' ? 'Thêm khách' : `Sửa khách ${editing}`}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {LABELS.map(([f, label]) => (
              <Field key={f} label={label}>
                <input
                  className={inputClass}
                  value={form[f]}
                  disabled={f === 'code' && editing !== 'new'}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-3">
            <Button kind="primary" onClick={save}>Lưu</Button>
            <Button kind="secondary" onClick={() => setEditing(null)}>Huỷ</Button>
          </div>
        </Card>
      )}

      {list.data && rows.length === 0 && <Notice>{list.data.length === 0 ? 'Chưa có khách nào. Bấm "Thêm khách".' : 'Không có khách khớp.'}</Notice>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <Card key={c.code} className="space-y-1">
            <p className="font-semibold">{c.name} <span className="font-normal text-slate-600">({c.code})</span></p>
            {c.short_name && <p className="text-sm text-slate-600">Viết tắt: {c.short_name}</p>}
            {c.delivery_address && <p className="text-sm">Giao: {c.delivery_address}</p>}
            {c.address && <p className="text-sm">ĐC: {c.address}</p>}
            {(c.contact || c.phone1 || c.phone2) && <p className="text-sm">{[c.contact, c.phone1, c.phone2].filter(Boolean).join(' · ')}</p>}
            {c.sup && <p className="text-sm text-slate-600">Sup: {c.sup}</p>}
            {c.note && <p className="text-sm text-slate-600">{c.note}</p>}
            <div className="flex gap-3 pt-2">
              <Button kind="secondary" onClick={() => open(c)}>Sửa</Button>
              <Button kind="danger" onClick={() => remove(c)}>Xoá</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
