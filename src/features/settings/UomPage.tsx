import { useState } from 'react'
import { deleteUom, distinctUomRaw, getUomMap, setUom } from '../../shared/inventory/repo.ts'
import { makeUomLabeler, uomKey } from '../../shared/inventory/uom.ts'
import { Button, Card, Field, inputClass, Notice, useLoad } from '../../shared/ui/ui.tsx'

export default function UomPage() {
  const map = useLoad(getUomMap, [])
  const raws = useLoad(distinctUomRaw, [])
  const [rawNew, setRawNew] = useState('')
  const [labelNew, setLabelNew] = useState('')

  const m = map.data ?? {}
  const labeler = makeUomLabeler(m)
  // Các ĐVT trong dữ liệu, gộp theo khoá (CAI = CÁI = Cái)
  const seen = new Map<string, string[]>()
  for (const r of raws.data ?? []) {
    const k = uomKey(r)
    seen.set(k, [...new Set([...(seen.get(k) ?? []), r])])
  }
  const keys = [...new Set([...seen.keys(), ...Object.keys(m)])].sort()

  async function save(key: string, label: string) {
    if (label.trim()) await setUom(key, label.trim())
    else await deleteUom(key)
    map.reload()
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Đơn vị tính viết khác nhau (CAI, CÁI, Cái, Chiếc…) được gom về một tên trên phiếu. Gõ tên muốn hiện, để
        trống để giữ nguyên như trong file.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {keys.map((k) => (
          <Card key={k} className="space-y-2">
            <p className="text-sm text-slate-600">
              Trong file: {(seen.get(k) ?? [k]).join(' / ')} → hiện: <b>{labeler((seen.get(k) ?? [k])[0])}</b>
            </p>
            <input
              className={inputClass}
              defaultValue={m[k] ?? ''}
              placeholder={(seen.get(k) ?? [k])[0]}
              aria-label={`Tên hiển thị cho ${k}`}
              onBlur={(e) => {
                if (e.target.value.trim() !== (m[k] ?? '')) save(k, e.target.value)
              }}
            />
          </Card>
        ))}
      </div>
      {keys.length === 0 && <Notice>Chưa có ĐVT nào. Nạp dữ liệu trước, hoặc thêm quy đổi bên dưới.</Notice>}

      <Card className="space-y-3">
        <h2 className="font-semibold">Thêm quy đổi</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ĐVT trong file (vd: Thùng)">
            <input className={inputClass} value={rawNew} onChange={(e) => setRawNew(e.target.value)} />
          </Field>
          <Field label="Hiện trên phiếu là">
            <input className={inputClass} value={labelNew} onChange={(e) => setLabelNew(e.target.value)} />
          </Field>
        </div>
        <Button
          kind="primary"
          disabled={!rawNew.trim() || !labelNew.trim()}
          onClick={async () => {
            await save(uomKey(rawNew), labelNew)
            setRawNew('')
            setLabelNew('')
          }}
        >
          Thêm
        </Button>
      </Card>
    </div>
  )
}
