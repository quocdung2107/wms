import { useEffect, useState } from 'react'
import { signedImageUrls } from './api'
import { isExpired } from './imageExpiry'
import type { Attachment } from './types'

/** Lưới ảnh của một message (1, 2, 3, 4+ ảnh) + xem ảnh lớn. Ảnh lấy bằng signed URL. */
export function AlbumGrid({ attachments }: { attachments: Attachment[] }) {
  const items = [...attachments].sort((a, b) => a.position - b.position)
  const now = Date.now()
  const key = items.filter((a) => !isExpired(a, now)).map((a) => a.path).join('|')
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (!key) return
    let alive = true
    signedImageUrls(key.split('|')).then(
      (m) => alive && (setUrls(m), setFailed(false)),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [key, tries])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : Math.min(items.length - 1, i + 1)))
      else if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items.length])

  const n = items.length
  const shown = items.slice(0, Math.min(n, 4))
  const cols = n === 1 ? 'grid-cols-1' : 'grid-cols-2'

  function cell(a: Attachment, i: number) {
    const expired = isExpired(a, now)
    const url = expired ? undefined : urls.get(a.path)
    const span = n === 3 && i === 0 ? 'col-span-2 aspect-video' : n === 1 ? 'aspect-[4/3]' : 'aspect-square'
    return (
      <button
        key={a.id}
        type="button"
        aria-label={`Xem ảnh ${i + 1}`}
        onClick={() => setOpen(i)}
        className={`relative overflow-hidden rounded-md bg-slate-200 ${span}`}
      >
        {expired ? (
          <span className="grid h-full place-items-center p-1 text-center text-sm text-slate-500">Ảnh đã hết hạn</span>
        ) : url ? (
          <img src={url} alt="" loading="lazy" onError={() => setTries((t) => (t < 2 ? t + 1 : t))} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-sm text-slate-500">{failed ? 'Lỗi ảnh' : '…'}</span>
        )}
        {n > 4 && i === 3 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-xl font-semibold text-white">+{n - 4}</span>}
      </button>
    )
  }

  const cur = open === null ? null : items[open]
  return (
    <>
      <div className={`grid w-full max-w-xs gap-1 sm:max-w-sm ${cols}`}>{shown.map(cell)}</div>
      {failed && key && (
        <button type="button" className="text-sm text-teal-800 underline" onClick={() => setTries((t) => t + 1)}>
          Tải lại ảnh
        </button>
      )}
      {cur && open !== null && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setOpen(null)}>
          {isExpired(cur, now) ? (
            <span className="text-white" onClick={(e) => e.stopPropagation()}>Ảnh đã hết hạn</span>
          ) : urls.get(cur.path) ? (
            <img src={urls.get(cur.path)} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            <span className="text-white">Không tải được ảnh</span>
          )}
          <button type="button" aria-label="Đóng" onClick={() => setOpen(null)} className="absolute right-2 top-2 min-h-11 min-w-11 rounded-full bg-white/20 text-2xl text-white">
            ×
          </button>
          {open > 0 && (
            <button type="button" aria-label="Ảnh trước" onClick={(e) => (e.stopPropagation(), setOpen(open - 1))} className="absolute left-2 min-h-11 min-w-11 rounded-full bg-white/20 text-2xl text-white">
              ‹
            </button>
          )}
          {open < n - 1 && (
            <button type="button" aria-label="Ảnh sau" onClick={(e) => (e.stopPropagation(), setOpen(open + 1))} className="absolute right-2 min-h-11 min-w-11 rounded-full bg-white/20 text-2xl text-white">
              ›
            </button>
          )}
          <span className="absolute bottom-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            {open + 1} / {n}
          </span>
        </div>
      )}
    </>
  )
}
