import { BASE_SCHEDULE, DEFAULT_DATE } from './hangSo.js'

/* ============================================================
   Hàm tiện ích
   ============================================================ */

export const formatVnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`

export function sortRows(rows, cols, sel) {
  if (!sel) return rows
  const [key, dir] = sel.split('|')
  const col = cols.find((c) => c.key === key)
  if (!col) return rows
  const sign = dir === 'desc' ? -1 : 1
  const rong = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))
  return [...rows].sort((a, b) => {
    const va = col.get(a)
    const vb = col.get(b)
    if (rong(va) && rong(vb)) return 0
    if (rong(va)) return 1
    if (rong(vb)) return -1
    const c = col.type === 'text' ? String(va).localeCompare(String(vb), 'vi', { sensitivity: 'base', numeric: true }) : va < vb ? -1 : va > vb ? 1 : 0
    return c * sign
  })
}


// Trạng thái mẫu ổn định theo ngày + sân + giờ (không đổi mỗi lần render)
function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}


function getSlotStatus(date, court, hourIndex) {
  if (!court.active) return 'bảo trì'
  if (date === DEFAULT_DATE && BASE_SCHEDULE[court.name]) return BASE_SCHEDULE[court.name][hourIndex]
  const n = hashString(`${date}|${court.name}|${hourIndex}`) % 100
  if (n < 28) return 'đã đặt'
  if (n < 36) return 'đang giữ'
  if (n < 40) return 'bảo trì'
  return 'trống'
}

function resizeToDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được ảnh này.'))
    }
    img.src = url
  })
}
