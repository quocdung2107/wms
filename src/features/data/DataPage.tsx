import { useRef, useState } from 'react'
import { dbReady } from '../../shared/db/client.ts'
import { deleteSource, listSources, type Source } from '../../shared/inventory/repo.ts'
import { Button, Card, Notice, useLoad } from '../../shared/ui/ui.tsx'
import ImportWizard from './ImportWizard.tsx'

export default function DataPage() {
  const sources = useLoad(listSources, [])
  const storage = useLoad(() => dbReady, [])
  const [pending, setPending] = useState<{ file: File; forSource?: Source } | null>(null)
  const [message, setMessage] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const forRef = useRef<Source | undefined>(undefined)

  function pick(forSource?: Source) {
    forRef.current = forSource
    picker.current?.click()
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Nạp file Excel/CSV từ WMS hoặc MISA. File được đọc ngay trong trình duyệt, không gửi đi đâu. Mỗi nguồn
        chỉ giữ bản mới nhất.
      </p>
      {storage.data && !storage.data.persistent && (
        <Notice kind="warn">
          Trình duyệt không lưu được dữ liệu lâu dài (cần HTTPS hoặc localhost, và chỉ mở app ở một tab):
          dữ liệu sẽ mất khi tải lại trang.
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}

      <input
        ref={picker}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) {
            setMessage('')
            setPending({ file, forSource: forRef.current })
          }
        }}
      />

      {pending ? (
        <ImportWizard
          key={pending.file.name + pending.file.lastModified}
          file={pending.file}
          sources={sources.data ?? []}
          forSource={pending.forSource}
          onCancel={() => setPending(null)}
          onDone={(m) => {
            setPending(null)
            setMessage(m)
            sources.reload()
          }}
        />
      ) : (
        <Button kind="primary" onClick={() => pick()}>Nạp file Excel/CSV</Button>
      )}

      <h2 className="pt-2 text-lg font-semibold">Nguồn đã nạp</h2>
      {sources.error && <Notice kind="error">{sources.error}</Notice>}
      {sources.data?.length === 0 && <p className="text-slate-600">Chưa có nguồn nào.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {sources.data?.map((s) => (
          <Card key={s.id} className="space-y-2">
            <p className="text-lg font-semibold">{s.name}</p>
            <p className="text-sm text-slate-600">
              {s.row_count} dòng · nạp {s.loaded_at || 'chưa có'} · file {s.file_name || '—'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => pick(s)}>Nạp file mới</Button>
              <Button
                kind="danger"
                onClick={async () => {
                  if (confirm(`Xoá nguồn "${s.name}" và toàn bộ dữ liệu của nó?`)) {
                    await deleteSource(s.id)
                    sources.reload()
                  }
                }}
              >
                Xoá
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
