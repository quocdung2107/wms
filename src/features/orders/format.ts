export function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

export function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'vừa xong'
  if (min < 60) return `${min} phút trước`
  if (min < 1440) return `${Math.round(min / 60)} giờ trước`
  return `${Math.round(min / 1440)} ngày trước`
}
