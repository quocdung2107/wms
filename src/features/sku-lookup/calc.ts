// Máy tính kiểm tồn: bộ phân tích đệ quy, không dùng eval.
export type EvalResult = { ok: true; value: number } | { ok: false; error: string }

const fail = (error: string): EvalResult => ({ ok: false, error })

export function evalExpr(input: string): EvalResult {
  const s = String(input ?? '').replace(/\s+/g, '')
  if (!s) return fail('Phép tính trống')
  let i = 0
  let err: string | null = null

  const expr = (): number => {
    let v = term()
    while (!err && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++]
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const term = (): number => {
    let v = unary()
    while (!err && (s[i] === '*' || s[i] === 'x' || s[i] === 'X' || s[i] === '/')) {
      const op = s[i++]
      const r = unary()
      if (op === '/') {
        if (r === 0) { err = 'Chia cho 0'; return 0 }
        v = v / r
      } else v = v * r
    }
    return v
  }
  const unary = (): number => {
    if (s[i] === '-') { i++; return -unary() }
    if (s[i] === '+') { i++; return unary() }
    return primary()
  }
  const primary = (): number => {
    if (s[i] === '(') {
      i++
      const v = expr()
      if (err) return 0
      if (s[i] !== ')') { err = 'Thiếu dấu )'; return 0 }
      i++
      return v
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i))
    if (!m) { err = i < s.length ? 'Ký tự không hợp lệ' : 'Phép tính chưa đầy đủ'; return 0 }
    i += m[0].length
    return Number(m[0])
  }

  const v = expr()
  if (err) return fail(err)
  if (i < s.length) return fail('Ký tự không hợp lệ')
  if (!Number.isFinite(v)) return fail('Kết quả không hợp lệ')
  return { ok: true, value: v }
}

export function sumLines(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** Lệch = tồn hệ thống - tổng đếm; tồn null coi là 0; dung sai 1e-9 về 0. */
export function calcDiff(qtySystem: number | null | undefined, total: number): number {
  const d = (qtySystem ?? 0) - total
  return Math.abs(d) < 1e-9 ? 0 : d
}
