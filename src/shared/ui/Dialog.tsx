import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

type Opts = {
  message: string
  okText?: string
  cancelText?: string | null
  input?: { defaultValue: string; inputMode?: 'decimal' | 'text' }
  danger?: boolean
}

function DialogView({ opts, done }: { opts: Opts; done: (v: string | boolean | null) => void }) {
  const [val, setVal] = useState(opts.input?.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const cancel = () => done(opts.input ? null : false)
  const ok = () => done(opts.input ? val : true)

  useEffect(() => {
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line
  }, [])

  const btn = 'min-h-11 min-w-24 rounded-lg px-4 text-base font-semibold '
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && cancel()}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-4 shadow-xl">
        <p className="whitespace-pre-line text-base text-slate-900">{opts.message}</p>
        {opts.input && (
          <input
            ref={inputRef}
            autoFocus
            type="text"
            inputMode={opts.input.inputMode}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ok()}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
          />
        )}
        <div className="flex justify-end gap-2">
          {opts.cancelText !== null && (
            <button type="button" className={btn + 'bg-slate-100 text-slate-800'} onClick={cancel}>
              {opts.cancelText ?? 'Huỷ'}
            </button>
          )}
          <button
            type="button"
            autoFocus={!opts.input}
            className={btn + (opts.danger ? 'bg-red-600 text-white' : 'bg-blue-600 text-white')}
            onClick={ok}
          >
            {opts.okText ?? 'Đồng ý'}
          </button>
        </div>
      </div>
    </div>
  )
}

function open(opts: Opts): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(
      <DialogView
        opts={opts}
        done={(v) => {
          root.unmount()
          host.remove()
          resolve(v)
        }}
      />,
    )
  })
}

export async function confirmDialog(message: string, o: { okText?: string; danger?: boolean } = {}): Promise<boolean> {
  return (await open({ message, ...o })) === true
}

export async function noticeDialog(message: string): Promise<void> {
  await open({ message, cancelText: null, okText: 'Đóng' })
}

/** Ô nhập số; trả chuỗi người dùng nhập, hoặc null nếu Huỷ/Esc. */
export async function promptNumber(message: string, defaultValue: string): Promise<string | null> {
  const r = await open({ message, input: { defaultValue, inputMode: 'decimal' } })
  return typeof r === 'string' ? r : null
}
