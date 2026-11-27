import { callApi } from './api.js'
import { giaCuaThu } from './nghiepVu.js'
import { cut5, toHHMM, toMinutes } from './thoiGian.js'

// Bảng giá của cơ sở: mỗi khung giờ có giá riêng cho từng thứ trong tuần (backend `giaTheoThu`, 7 thứ).
// Web hiển thị giá vãng lai và khi lưu gửi cùng một giá cho cả hai loại khách.
export const MAX_PRICE = 10_000_000


export function toRow(k) {
  const row = { gioBatDau: cut5(k.gioBatDau), gioKetThuc: cut5(k.gioKetThuc), saved: true } // saved = đã có trong database
  row.gia = [1, 2, 3, 4, 5, 6, 7].map((thu) => {
    const g = giaCuaThu(k, thu)
    return g == null ? '' : String(g)
  }) // giá từng thứ: gia[0] = Thứ 2 … gia[6] = Chủ nhật
  return row
}


// Trả về thông báo lỗi (khớp quy tắc của backend) hoặc null nếu hợp lệ
export function validatePricing(rows, open, close) {
  if (rows.length === 0) return 'Cần ít nhất 1 khung giá.'
  if (rows.length > 24) return 'Tối đa 24 khung giá.'
  const sorted = [...rows].sort((a, b) => toMinutes(a.gioBatDau) - toMinutes(b.gioBatDau))
  let prevEnd = -1
  for (const r of sorted) {
    if (!r.gioBatDau || !r.gioKetThuc) return 'Nhập đầy đủ giờ bắt đầu và giờ kết thúc.'
    const s = toMinutes(r.gioBatDau)
    const e = toMinutes(r.gioKetThuc)
    if (e <= s) return `Khung ${r.gioBatDau}–${r.gioKetThuc}: giờ kết thúc phải sau giờ bắt đầu.`
    if (open && close && (s < toMinutes(open) || e > toMinutes(close))) {
      return `Khung ${r.gioBatDau}–${r.gioKetThuc} nằm ngoài giờ mở cửa ${open}–${close}.`
    }
    if (s < prevEnd) return 'Các khung giờ bị chồng nhau.'
    prevEnd = e
    for (let i = 0; i < 7; i++) {
      const raw = r.gia?.[i]
      const v = Number(raw)
      if (raw === '' || raw == null || !Number.isInteger(v) || v < 0 || v > MAX_PRICE) {
        return `Khung ${r.gioBatDau}–${r.gioKetThuc}: giá ${DAY_NAMES[i].long} phải là số nguyên từ 0 đến ${MAX_PRICE.toLocaleString('vi-VN')}.`
      }
    }
  }
  return null
}


// Các khoảng giờ mở cửa chưa có giá (khách không đặt được các khoảng này)
export function findPriceGaps(rows, open, close) {
  if (!open || !close || rows.length === 0) return []
  const ok = rows.filter((r) => r.gioBatDau && r.gioKetThuc && toMinutes(r.gioKetThuc) > toMinutes(r.gioBatDau))
  const sorted = [...ok].sort((a, b) => toMinutes(a.gioBatDau) - toMinutes(b.gioBatDau))
  const gaps = []
  let cursor = toMinutes(open)
  for (const r of sorted) {
    const s = toMinutes(r.gioBatDau)
    if (s > cursor) gaps.push(`${toHHMM(cursor)}–${toHHMM(s)}`)
    cursor = Math.max(cursor, toMinutes(r.gioKetThuc))
  }
  if (cursor < toMinutes(close)) gaps.push(`${toHHMM(cursor)}–${close}`)
  return gaps
}


// Khoá (đóng) mọi sân đang hoạt động của một cơ sở chưa đủ bảng giá. Làm tốt nhất có thể: lỗi (vd sân còn đơn đặt) thì bỏ qua.
export async function khoaSanChuaDuGia(token, maCoSo) {
  try {
    const cacSan = await callApi(`/api/chu-san/san?maCoSo=${maCoSo}`, { token })
    await Promise.all(
      (Array.isArray(cacSan) ? cacSan : [])
        .filter((c) => c.trangThai === 'active')
        .map((c) => callApi(`/api/chu-san/san/${c.maSan}/dong`, { method: 'PATCH', token, body: {} }).catch(() => null)),
    )
  } catch {
    // bỏ qua
  }
}


// Bảng giá đã ĐỦ chưa. Lưu ý: backend bắt buộc mỗi khung giờ có giá cho 7 thứ, nên khi chủ sân chỉ chọn vài thứ, web điền TẠM
// giá cho các thứ còn lại (xem rowsFromEntries) → dữ liệu backend luôn trông như "đủ 7 thứ". Vì vậy phải dựa vào các DÒNG GIÁ
// mà chủ sân thật sự đã chọn (khung giờ + các thứ + giá, ghi nhớ trên trình duyệt) để biết thứ nào chưa có giá.
// Trả về danh sách phần còn thiếu, ví dụ ['Thứ 3: 06:00–22:00', ...]; mảng rỗng = đã đủ giờ hoạt động cho cả 7 thứ.
export function phanThieuBangGia(bg) {
  const open = cut5(bg?.gioMoCua)
  const close = cut5(bg?.gioDongCua)
  if (!open || !close) return ['chưa có giờ hoạt động']
  const rows = (bg.khungGias ?? []).filter((k) => k.gioBatDau && k.gioKetThuc).map(toRow)
  if (rows.length === 0) return ['chưa có bảng giá']
  const entries = restoreEntries(rows, readPriceMeta(bg.maCoSo))
  const thieu = []
  for (let thu = 1; thu <= 7; thu += 1) {
    const dong = entries
      .filter((e) => e.days.includes(thu))
      .map((e) => ({ batDau: toMinutes(e.time[0]), ketThuc: toMinutes(e.time[1]) }))
      .sort((x, y) => x.batDau - y.batDau)
    let cursor = toMinutes(open)
    const gaps = []
    for (const r of dong) {
      if (r.batDau > cursor) gaps.push(`${toHHMM(cursor)}–${toHHMM(r.batDau)}`)
      cursor = Math.max(cursor, r.ketThuc)
    }
    if (cursor < toMinutes(close)) gaps.push(`${toHHMM(cursor)}–${close}`)
    if (gaps.length) thieu.push(`${DAY_NAMES[thu - 1].long}: ${gaps.join(', ')}`)
  }
  return thieu
}

export const bangGiaDuTatCaThu = (bg) => phanThieuBangGia(bg).length === 0


export const DAY_NAMES = [
  { n: 1, short: 'T2', long: 'Thứ 2' },
  { n: 2, short: 'T3', long: 'Thứ 3' },
  { n: 3, short: 'T4', long: 'Thứ 4' },
  { n: 4, short: 'T5', long: 'Thứ 5' },
  { n: 5, short: 'T6', long: 'Thứ 6' },
  { n: 6, short: 'T7', long: 'Thứ 7' },
  { n: 7, short: 'CN', long: 'C.Nhật' },
]


// Chủ sân chọn thứ tự do (bất kỳ tập con của T2–CN). Hiển thị gọn: từ 3 thứ liên tiếp trở lên gộp thành khoảng
// (T2, T3, T4 → "T2 - T4"); các thứ lẻ liệt kê cách nhau dấu phẩy (T2, T4, T6 → "T2, T4, T6").
export function daysText(days) {
  const d = [...new Set(days ?? [])].sort((a, b) => a - b)
  const ten = (n) => DAY_NAMES.find((x) => x.n === n)?.short ?? ''
  const parts = []
  let i = 0
  while (i < d.length) {
    let j = i
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++
    if (j - i + 1 >= 3) parts.push(`${ten(d[i])} - ${ten(d[j])}`)
    else for (let k = i; k <= j; k++) parts.push(ten(d[k]))
    i = j + 1
  }
  return parts.join(', ')
}

const daysOverlap = (a, b) => (a ?? []).some((n) => (b ?? []).includes(n))

// Dòng giá đã lưu trên máy ở dạng cũ ({ kind }) → dạng mới ({ days })
function normEntry(e) {
  if (Array.isArray(e.days) && e.days.length > 0) return { ...e, days: [...new Set(e.days)].sort((a, b) => a - b) }
  const days = e.kind === 'weekday' ? [1, 2, 3, 4, 5] : e.kind === 'weekend' ? [6, 7] : [1, 2, 3, 4, 5, 6, 7]
  const rest = { ...e }
  delete rest.kind
  return { ...rest, days }
}


// Bảng giá được ghép từ các "dòng giá": mỗi dòng = 1 khung giờ + loại ngày (T2–T6 / T7–CN / cả tuần) + giá.
// Backend chỉ lưu theo khung giờ với 2 mức giá (ngày thường, cuối tuần) nên: tên sự kiện, loại ngày đã chọn và
// khung theo ngày được ghi nhớ trên trình duyệt này (localStorage).
const keyOfTime = (time) => `${time[0]}-${time[1]}`

const priceMetaKey = (maCoSo) => `bangGiaMeta:${maCoSo}`


export function readPriceMeta(maCoSo) {
  let meta = {}
  try {
    meta = JSON.parse(localStorage.getItem(priceMetaKey(maCoSo)) ?? '{}')
  } catch {
    meta = {}
  }
  if (!meta.names) {
    try {
      meta.names = JSON.parse(localStorage.getItem(`bangGiaTen:${maCoSo}`) ?? '{}') // bản cũ chỉ lưu tên
    } catch {
      meta.names = {}
    }
  }
  return meta
}


export function writePriceMeta(maCoSo, entries, dated) {
  const names = {}
  entries.forEach((e) => {
    if (e.ten) names[keyOfTime(e.time)] = e.ten
  })
  try {
    localStorage.setItem(priceMetaKey(maCoSo), JSON.stringify({ entries, names, dated }))
  } catch {
    // trình duyệt không cho lưu: bỏ qua
  }
}


// Khung giá từ database → các dòng giá: trong mỗi khung giờ, các thứ cùng mức giá gộp thành một dòng (vd T2–T6 giá A, T7–CN giá B)
function entriesFromRows(rows, meta) {
  const out = []
  rows.forEach((r) => {
    const time = [r.gioBatDau, r.gioKetThuc]
    const key = keyOfTime(time)
    const ten = meta.names?.[key] ?? ''
    const theoGia = new Map()
    ;(r.gia ?? []).forEach((g, i) => {
      if (g === '' || g == null) return
      theoGia.set(String(Number(g)), [...(theoGia.get(String(Number(g))) ?? []), i + 1])
    })
    ;[...theoGia.entries()]
      .sort((a, b) => a[1][0] - b[1][0])
      .forEach(([gia, days]) => out.push({ id: `${key}-${days.join('')}`, ten, time, days, gia }))
  })
  return out
}


// Các dòng giá → khung giá gửi backend. Backend bắt buộc các khung giờ KHÔNG chồng nhau và mỗi khung có đủ giá cho 7 thứ,
// nên web cắt trục giờ tại mọi mốc: mỗi đoạn lấy giá của dòng giá có chứa thứ đó. Thứ nào chưa có dòng giá trong đoạn
// thì tạm lấy mức giá của dòng giá đầu tiên phủ đoạn đó; đoạn nào không có dòng giá nào thì để trống.
export function rowsFromEntries(entries) {
  const moc = new Set()
  entries.forEach((e) => {
    moc.add(toMinutes(e.time[0]))
    moc.add(toMinutes(e.time[1]))
  })
  const diem = [...moc].sort((a, b) => a - b)
  const rows = []
  for (let i = 0; i < diem.length - 1; i++) {
    const a = diem[i]
    const b = diem[i + 1]
    const phu = entries.filter((e) => toMinutes(e.time[0]) <= a && b <= toMinutes(e.time[1]))
    if (phu.length === 0) continue
    const goc = [...phu].sort((x, y) => x.days[0] - y.days[0])[0]
    const gia = [1, 2, 3, 4, 5, 6, 7].map((thu) => String((phu.find((e) => e.days.includes(thu)) ?? goc).gia))
    const row = { gioBatDau: toHHMM(a), gioKetThuc: toHHMM(b), gia }
    const truoc = rows[rows.length - 1]
    // đoạn liền kề cùng giá thì gộp lại
    if (truoc && truoc.gioKetThuc === row.gioBatDau && truoc.gia.join() === row.gia.join()) {
      truoc.gioKetThuc = row.gioKetThuc
    } else {
      rows.push(row)
    }
  }
  return rows
}


// Chữ ký của danh sách khung giá (để biết các dòng giá đã lưu trên máy có còn khớp với database không)
function rowsSig(rows) {
  return JSON.stringify(rows.map((r) => [cut5(r.gioBatDau), cut5(r.gioKetThuc), ...(r.gia ?? []).map(Number)]).sort())
}


// Dựng các dòng giá hiển thị từ khung giá backend: còn khớp với bản ghi nhớ trên máy thì dùng lại (giữ đúng khung giờ gốc, tên sự kiện), nếu không thì suy ra từ khung giá
export function restoreEntries(rows, meta) {
  if (Array.isArray(meta.entries) && meta.entries.length > 0) {
    const entries = meta.entries.map(normEntry)
    if (rowsSig(rowsFromEntries(entries)) === rowsSig(rows)) return entries
  }
  return entriesFromRows(rows, meta)
}


// Tìm khung giá MỚI (newId) trùng giờ + trùng thứ với một khung đã có (khác loại thứ thì được trùng giờ)
export function findClassOverlap(entries, newId) {
  const moi = entries.find((x) => x.id === newId)
  const tx = (a, b) => daysOverlap(a.days, b.days) && toMinutes(a.time[0]) < toMinutes(b.time[1]) && toMinutes(b.time[0]) < toMinutes(a.time[1])
  const mo = (e) => `${e.time[0]}–${e.time[1]} (${daysText(e.days)})`
  // 1) Khung vừa chọn (khung mới) so với các khung đã có: báo đúng giờ và thứ của khung mới
  if (moi) {
    const c = entries.find((x) => x !== moi && tx(moi, x))
    if (c) {
      return `Khung giờ mới ${mo(moi)} trùng với khung giờ đã có ${mo(c)} của sự kiện "${c.ten || 'Giờ cố định'}". Hãy đổi sang thứ khác hoặc đổi giờ.`
    }
  }
  // 2) Các khung đã lưu từ trước tự trùng nhau (không liên quan khung mới)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (a !== moi && b !== moi && tx(a, b)) {
        return `Bảng giá hiện có đang bị trùng: ${mo(a)} (sự kiện "${a.ten || 'Giờ cố định'}") và ${mo(b)} (sự kiện "${b.ten || 'Giờ cố định'}"). Hãy sửa hoặc xóa một trong hai khung.`
      }
    }
  }
  return null
}
