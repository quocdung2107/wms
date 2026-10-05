// Chuẩn hoá ĐVT: khoá = bỏ dấu + in hoa (CAI = CÁI = Cái); nhãn hiển thị do người dùng sửa.
export const uomKey = (raw: string) =>
  raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

export const DEFAULT_UOM: Record<string, string> = { CAI: 'Cái', CHIEC: 'Cái' }

export function makeUomLabeler(map: Record<string, string>) {
  return (raw: string) => {
    const key = uomKey(raw)
    return map[key] ?? raw.replace(/\s+/g, ' ').trim()
  }
}
