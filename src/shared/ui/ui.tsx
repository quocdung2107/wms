import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

const BTN = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium disabled:opacity-50'

export function Button({
  kind = 'secondary',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'danger' }) {
  const style = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800',
    secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[kind]
  return <button type="button" {...p} className={`${BTN} ${style} ${className}`} />
}

export const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</section>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const style = {
    info: 'bg-sky-50 text-sky-900',
    warn: 'bg-amber-50 text-amber-900',
    error: 'bg-red-50 text-red-900',
  }[kind]
  return <p className={`rounded-lg px-3 py-2 text-base ${style}`}>{children}</p>
}

/** State nhớ trong localStorage (tuỳ chọn giao diện; hỏng/không có thì dùng mặc định). */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? ({ ...(typeof initial === 'object' ? initial : {}), ...JSON.parse(raw) } as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T | ((p: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(v))
        } catch {
          /* bỏ qua */
        }
        return v
      }),
    [key],
  )
  return [value, set] as const
}

/** Chạy một hàm async khi mount / khi `deps` đổi; có reload thủ công. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e) => alive && setState({ error: e instanceof Error ? e.message : String(e), loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}

/** Mở hộp thoại in với khổ giấy yêu cầu (chèn @page cho tới khi in xong). */
export function printPage(orientation: 'landscape' | 'portrait') {
  const style = document.createElement('style')
  style.textContent = `@page { size: A4 ${orientation}; margin: 8mm; }`
  document.head.appendChild(style)
  const cleanup = () => {
    style.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
