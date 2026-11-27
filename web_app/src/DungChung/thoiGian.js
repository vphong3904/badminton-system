import { API_URL } from './api.js'

// ===== Giờ máy chủ (đồng bộ web – app) =====
// Mọi mốc "bây giờ" của web lấy theo giờ máy chủ: API có sẵn GET /api/gio-may-chu (epochMs, ngay, gio; múi +07:00).
// Web đo độ lệch giữa đồng hồ máy và máy chủ rồi cộng vào Date.now() — nên đồng hồ máy tính có sai cũng không ảnh hưởng.
const VN_OFFSET_MS = 7 * 3600000

let SERVER_OFFSET_MS = 0

export const nowMs = () => Date.now() + SERVER_OFFSET_MS

export async function syncServerClock() {
  try {
    const t0 = Date.now()
    const res = await fetch(`${API_URL}/api/gio-may-chu`)
    const payload = await res.json()
    const t1 = Date.now()
    const epoch = Number(payload?.duLieu?.epochMs)
    if (payload?.thanhCong && Number.isFinite(epoch)) SERVER_OFFSET_MS = epoch - Math.round((t0 + t1) / 2)
    return true
  } catch {
    return false // không gọi được máy chủ: tạm dùng giờ máy, lần đồng bộ sau sẽ sửa
  }
}

// Ngày / giờ hiện tại theo giờ Việt Nam của máy chủ
export const vnClock = (ms = nowMs()) => new Date(ms + VN_OFFSET_MS)

const vnIsoOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

// Ngày hiện tại theo giờ máy chủ (YYYY-MM-DD)
export function todayISO() {
  return vnIsoOf(vnClock())
}

// Ngày lệch n ngày so với hôm nay (YYYY-MM-DD) — dùng cho dữ liệu mẫu
export function addDaysISO(n) {
  return vnIsoOf(vnClock(nowMs() + n * 86400000))
}

// Khung giờ của ma trận lịch sân lấy theo giờ mở cửa – đóng cửa của cơ sở (CoSo.GioMoCua / GioDongCua), mỗi ô 30 phút.
// Các hàm tiện ích dùng chung cho lịch, cửa sổ khoá sân và cửa sổ tạo đơn.
export const SLOT_MIN = 30

export function slotTimes(openMin, closeMin) {
  const list = []
  for (let m = openMin; m <= closeMin; m += SLOT_MIN) list.push(toHHMM(m))
  return list
}

export function eachDay(fromIso, toIso) {
  const days = []
  const end = Date.parse(`${toIso}T00:00:00Z`)
  for (let t = Date.parse(`${fromIso}T00:00:00Z`); t <= end; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10))
  return days
}

export const ngayGioKey = (ngay, gio) => `${String(ngay ?? '').slice(0, 10)} ${String(gio ?? '').slice(0, 5)}`


/* ============================================================
   Các trang
   ============================================================ */

export const WEEK_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export const pad2 = (n) => String(n).padStart(2, '0')


const parseISO = (str) => {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const isoOf = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`

export const addDays = (str, n) => {
  const dt = parseISO(str)
  dt.setDate(dt.getDate() + n)
  return isoOf(dt)
}

// Thứ 2 của tuần chứa ngày đã chọn
export const mondayOf = (str) => addDays(str, -((parseISO(str).getDay() + 6) % 7))

// Thứ 2 → giá trị của ô chọn tuần "YYYY-Www" (tuần ISO) và ngược lại
export function weekValueOf(mondayIso) {
  const thu = parseISO(addDays(mondayIso, 3)) // thứ 5 quyết định năm của tuần ISO
  const dayOfYear = Math.round((thu - new Date(thu.getFullYear(), 0, 1)) / 86400000) + 1
  return `${thu.getFullYear()}-W${pad2(Math.floor((dayOfYear - 1) / 7) + 1)}`
}

export function mondayOfWeekValue(value) {
  const m = /^(\d{4})-W(\d{2})$/.exec(value)
  if (!m) return null
  const jan4 = `${m[1]}-01-04`
  return addDays(mondayOf(jan4), (Number(m[2]) - 1) * 7)
}


export const toViDate = (iso) => iso.split('-').reverse().join('/')


export const viTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '')


export const toMinutes = (t) => {
  const [h, m] = String(t).split(':')
  return Number(h) * 60 + Number(m)
}

export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export const cut5 = (t) => String(t ?? '').slice(0, 5)
