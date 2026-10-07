export const MAX_IMAGES = 10
export const MAX_EDGE = 1600
export const MAX_BYTES = 2 * 1024 * 1024

/** Kích thước sau khi thu nhỏ: cạnh dài tối đa `max`, giữ tỉ lệ, không phóng to. */
export function fitSize(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(w, h)
  if (!(long > max)) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
  const k = max / long
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** Gộp ảnh mới vào danh sách đã chọn, tối đa `limit`; trả phần thừa bị bỏ. */
export function takeImages<T>(current: T[], added: T[], limit = MAX_IMAGES): { list: T[]; dropped: number } {
  const room = Math.max(0, limit - current.length)
  return { list: [...current, ...added.slice(0, room)], dropped: Math.max(0, added.length - room) }
}

export type Compressed = { blob: Blob; width: number; height: number; originalBytes: number }

/** Nén ảnh ở trình duyệt thành JPEG, cạnh dài ≤ 1600 px, ≤ 2 MB (giới hạn bucket). */
export async function compressImage(file: File): Promise<Compressed> {
  const bmp = await createImageBitmap(file)
  const { width, height } = fitSize(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('canvas')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  g.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  for (const q of [0.8, 0.65, 0.5, 0.35]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', q))
    if (blob && blob.size <= MAX_BYTES) return { blob, width, height, originalBytes: file.size }
  }
  throw new Error('image_too_large')
}
