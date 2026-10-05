import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'

export type CodeType = 'code128' | 'qr'

/** Mã vạch Code128 hoặc QR dạng SVG (nét đậm, vector, in sắc nét). Co giãn theo khung chứa. */
export function Code({ type, value, className = '' }: { type: CodeType; value: string; className?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    if (!value) return
    if (type === 'code128') {
      const el = svg.current
      if (!el) return
      try {
        JsBarcode(el, value, { format: 'CODE128', displayValue: false, margin: 0, width: 3, height: 80 })
        const w = el.getAttribute('width')
        const h = el.getAttribute('height')
        el.setAttribute('viewBox', `0 0 ${parseFloat(w ?? '0')} ${parseFloat(h ?? '0')}`)
        el.removeAttribute('width')
        el.removeAttribute('height')
        el.setAttribute('preserveAspectRatio', 'none')
        el.style.transform = ''
      } catch {
        setError('Không mã hoá được (Code128 không có chữ có dấu)')
      }
    } else {
      let alive = true
      QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(
        (s) => alive && setQr(s),
        () => alive && setError('Không tạo được QR'),
      )
      return () => {
        alive = false
      }
    }
  }, [type, value])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (type === 'qr') return <div className={`aspect-square ${className}`} dangerouslySetInnerHTML={{ __html: qr }} />
  return <svg ref={svg} className={className} role="img" aria-label={value} />
}
