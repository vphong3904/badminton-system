import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

/* ============================================================
   Dữ liệu mẫu
   ============================================================ */

const MENU = [
  { id: 'branches', label: 'Quản lý cơ sở' },
  { id: 'courts', label: 'Quản lý sân' },
  { id: 'pricing', label: 'Quản lý bảng giá' },
  { id: 'bookings', label: 'Quản lý đặt sân' },
  { id: 'calendar', label: 'Lịch hoạt động' },
  { id: 'refunds', label: 'Hoàn tiền' },
  { id: 'complaints', label: 'Khiếu nại' },
  { id: 'reviews', label: 'Đánh giá của Khách hàng' },
  { id: 'users', label: 'Danh sách khách đặt sân' },
  { id: 'overview', label: 'Doanh thu của cơ sở' },
]

// Địa bàn khi thêm cơ sở: app khách chỉ phục vụ TP. Hồ Chí Minh nên ô Tỉnh/Thành chỉ có một lựa chọn.
// Quận/Huyện là các đơn vị cấp huyện của TP.HCM trước 01/07/2026 (16 quận, 1 thành phố Thủ Đức, 5 huyện).
// Viết đúng như dữ liệu trong database (vd "Thủ Đức", "Gò Vấp") vì app khách lọc cơ sở theo đúng chuỗi này.
const BRANCH_PROVINCE = 'TP. Hồ Chí Minh'
const BRANCH_DISTRICTS = [
  'Quận 1', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 6', 'Quận 7', 'Quận 8', 'Quận 10', 'Quận 11', 'Quận 12',
  'Bình Tân', 'Bình Thạnh', 'Gò Vấp', 'Phú Nhuận', 'Tân Bình', 'Tân Phú', 'Thủ Đức',
  'Bình Chánh', 'Cần Giờ', 'Củ Chi', 'Hóc Môn', 'Nhà Bè',
]

const ALL_BRANCHES = 'Tất cả cơ sở'
const DEFAULT_DATE = '2026-10-30'

// ===== Giờ máy chủ (đồng bộ web – app) =====
// Mọi mốc "bây giờ" của web lấy theo giờ máy chủ: API có sẵn GET /api/gio-may-chu (epochMs, ngay, gio; múi +07:00).
// Web đo độ lệch giữa đồng hồ máy và máy chủ rồi cộng vào Date.now() — nên đồng hồ máy tính có sai cũng không ảnh hưởng.
const VN_OFFSET_MS = 7 * 3600000
let SERVER_OFFSET_MS = 0
const nowMs = () => Date.now() + SERVER_OFFSET_MS
async function syncServerClock() {
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
const vnClock = (ms = nowMs()) => new Date(ms + VN_OFFSET_MS)
const vnIsoOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
// Ngày hiện tại theo giờ máy chủ (YYYY-MM-DD)
function todayISO() {
  return vnIsoOf(vnClock())
}
// Ngày lệch n ngày so với hôm nay (YYYY-MM-DD) — dùng cho dữ liệu mẫu
function addDaysISO(n) {
  return vnIsoOf(vnClock(nowMs() + n * 86400000))
}
const HOURS = ['17:00', '18:00', '19:00', '20:00']
// Khung giờ của ma trận lịch sân lấy theo giờ mở cửa – đóng cửa của cơ sở (CoSo.GioMoCua / GioDongCua), mỗi ô 30 phút.
// Các hàm tiện ích dùng chung cho lịch, cửa sổ khoá sân và cửa sổ tạo đơn.
const SLOT_MIN = 30
function slotTimes(openMin, closeMin) {
  const list = []
  for (let m = openMin; m <= closeMin; m += SLOT_MIN) list.push(toHHMM(m))
  return list
}
function eachDay(fromIso, toIso) {
  const days = []
  const end = Date.parse(`${toIso}T00:00:00Z`)
  for (let t = Date.parse(`${fromIso}T00:00:00Z`); t <= end; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10))
  return days
}
const MAX_RANGE_DAYS = 90
// Cơ sở bị khoá (chủ sân khoá = closed, quản trị viên khoá = locked): khách không đặt được, các chức năng liên quan bị vô hiệu
const isBranchBlocked = (b) => b?.trangThai === 'closed' || b?.trangThai === 'locked'
// Link bản đồ: chủ sân tự dán link Google Maps (không còn gắn cứng phần https://maps.google.com/?q=).
// Luật khớp backend (validators/owner.js + utils/toaDoBanDo.js: laLinkGoogleMaps): http(s), tối đa 500 ký tự, host Google Maps / link rút gọn.
function checkMapLink(value) {
  const v = String(value ?? '').trim()
  if (!v) return 'Vui lòng nhập link Google Maps.'
  if (v.length > 500) return 'Link bản đồ tối đa 500 ký tự.'
  let url
  try {
    url = new URL(v)
  } catch {
    return 'Link không hợp lệ. Hãy dán link Google Maps, ví dụ https://maps.app.goo.gl/...'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Link phải bắt đầu bằng http:// hoặc https://.'
  const host = url.hostname
  const laRutGon = /^(maps\.app\.goo\.gl|goo\.gl)$/i.test(host)
  const laMaps = /^maps\.google\.[a-z.]+$/i.test(host)
  const laGoogleMaps = /^(www\.)?google\.[a-z.]+$/i.test(host) && url.pathname.startsWith('/maps')
  if (!laRutGon && !laMaps && !laGoogleMaps) return 'Vui lòng dán link Google Maps (ví dụ https://maps.app.goo.gl/...).'
  return ''
}
const BOOKING_STATUSES = ['Chờ thanh toán', 'Đã chuyển khoản', 'Đã thanh toán', 'Đã sử dụng sân', 'Chờ hoàn tiền', 'Đã huỷ']

// Trạng thái hiển thị = gộp trạng thái đơn (DatSan.TrangThai) và trạng thái thanh toán (ThanhToan.TrangThai) của backend:
//  - pending_payment + pending: khách vừa đặt từ app, chưa chuyển khoản → "Chưa hoàn tiền"
//  - pending_payment + confirming: khách đã gửi ảnh chuyển khoản → "Đã thanh toán" (chờ chủ sân Xác nhận / Huỷ đơn đặt)
//  - confirmed / completed → "Đã xác nhận" (lên Lịch hoạt động)
function layTrangThaiDon(d) {
  // Đơn khách vừa đặt chưa chuyển khoản (pending) và đơn hết hạn không hiển thị ở Quản lý đặt sân (trả về null)
  if (d.trangThai === 'pending_payment') {
    if (d.trangThaiThanhToan !== 'confirming') return null
    // Khách đã gửi ảnh chuyển khoản nhưng qua giờ kết thúc mà chủ sân chưa duyệt → hiển thị "Đã huỷ" ngay
    // (đúng luật job backend chotDonQuaGioChoi: đơn → expired, thanh toán → late_payment, hoàn 100% do Admin xử lý)
    return nowMs() >= mocGioDon(d, d.gioKetThuc) ? 'Đã huỷ' : 'Đã chuyển khoản'
  }
  // Đơn đã được hệ thống chốt vì qua giờ chơi chưa duyệt (backend: expired + late_payment)
  if (d.trangThai === 'expired' && d.trangThaiThanhToan === 'late_payment') return 'Đã huỷ'
  // Chủ sân tạo đơn ở Lịch hoạt động → "Chờ thanh toán" cho đến khi bấm "Thu tiền" thì thành "Đã thanh toán"; đơn của khách (chuyển khoản) → "Đã chuyển khoản"
  if (d.trangThai === 'confirmed' || d.trangThai === 'completed' || d.trangThai === 'checked_in') {
    // Đơn đã thanh toán (khách chuyển khoản hoặc chủ sân đã thu tiền) mà đã qua giờ kết thúc → "Đã sử dụng sân"
    const daThanhToan = d.nguon !== 'owner' || d.trangThaiThu === 'paid'
    const quaGio = d.trangThai === 'completed' || nowMs() >= mocGioDon(d, d.gioKetThuc)
    if (daThanhToan && quaGio) return 'Đã sử dụng sân'
    if (d.nguon !== 'owner') return 'Đã chuyển khoản'
    return d.trangThaiThu === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'
  }
  if (d.trangThai === 'cancelled') {
    // Khách đã chuyển khoản mà đơn bị huỷ → "Chờ hoàn tiền" đến khi chủ sân hoàn xong (trang Hoàn tiền) thì thành "Đã huỷ"
    if (d.trangThaiThanhToan === 'success' && (d.trangThaiHoanTien === 'processing' || d.trangThaiHoanTien === 'waiting_info')) return 'Chờ hoàn tiền'
    return 'Đã huỷ'
  }
  return null
}

// Thời điểm bắt đầu / kết thúc của đơn (giờ Việt Nam, cùng cách backend so với giờ hiện tại)
function mocGioDon(d, gio) {
  return new Date(`${String(d.ngay).slice(0, 10)}T${String(gio).slice(0, 5)}:00+07:00`).getTime()
}
// Nút "Huỷ đơn" chỉ còn khi chưa quá thời gian của đơn: đơn khách (hoàn tiền theo API) chỉ huỷ được trước giờ bắt đầu,
// đơn chủ sân tự tạo huỷ được đến hết giờ kết thúc; sau đó nút biến mất.
function coTheHuyDon(d, now = nowMs()) {
  if (d.trangThai === 'pending_payment') return d.trangThaiThanhToan === 'confirming' && now < mocGioDon(d, d.gioBatDau)
  if (d.trangThai !== 'confirmed') return false
  return d.nguon === 'owner' ? now < mocGioDon(d, d.gioKetThuc) : now < mocGioDon(d, d.gioBatDau)
}
// Nút "Chuyển sân": chỉ khi đơn còn hiệu lực (đã xác nhận, hoặc khách đã gửi ảnh chuyển khoản chờ duyệt) và CHƯA tới giờ bắt đầu.
function coTheChuyenSan(d, now = nowMs()) {
  const conHieuLuc = d.trangThai === 'confirmed' || (d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'confirming')
  return conHieuLuc && now < mocGioDon(d, d.gioBatDau)
}
// Lý do huỷ đơn do chủ sân chọn: 'problem' = Sân đang có vấn đề (hoàn 100%), 'other' = Lý do khác (chủ sân tự nhập)
const LY_DO_SAN_CO_VAN_DE = 'Sân đang có vấn đề'
// Huỷ đơn bằng API có sẵn theo loại đơn:
//  - đơn chủ sân tạo: PATCH /dat-san/:maDatSan/huy (không hoàn tiền trong hệ thống)
//  - đơn của khách: POST /dat-san/:maDatSan/huy (hoàn theo API, đơn vào hàng đợi Hoàn tiền); đơn khách vừa gửi ảnh chuyển khoản
//    phải được xác nhận trước thì API huỷ mới nhận.
async function huyDonTheoLoai(token, d, lyDo) {
  if (d.nguon === 'owner') return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'PATCH', token, body: { lyDo } })
  if (d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'confirming') {
    // API huỷ đơn của khách chỉ nhận trước giờ bắt đầu: kiểm tra trước để không xác nhận thanh toán rồi mới báo lỗi
    if (nowMs() >= mocGioDon(d, d.gioBatDau)) throw new ApiError(0, 'Đơn đã quá giờ bắt đầu nên hệ thống không huỷ được nữa.')
    await callApi(`/api/chu-san/dat-san/${d.maDatSan}/xac-nhan-thanh-toan`, { method: 'POST', token })
  }
  return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'POST', token, body: { lyDo } })
}

// Đổi giờ hoạt động của cơ sở → xử lý bảng giá (API có sẵn GET/PUT /api/chu-san/co-so/:maCoSo/bang-gia):
//  - Giờ mở cửa tăng / giờ đóng cửa giảm (thu hẹp): cắt các khung giá cho vừa giờ mới (khung nằm hẳn ngoài thì bỏ).
//  - Giờ mở cửa giảm / giờ đóng cửa tăng (mở rộng): giữ nguyên khung giá, nhắc chủ sân bổ sung bảng giá cho phần mới;
//    yêu cầu mọi sân của cơ sở đã khoá (Quản lý sân) trước.
// Trả về { restore, reminder }; restore() khôi phục bảng giá cũ nếu bước lưu cơ sở sau đó bị lỗi.
async function prepareHoursChange(token, b, newOpen, newClose) {
  const oldOpen = cut5(b.gioMoCua)
  const oldClose = cut5(b.gioDongCua)
  if (newOpen === oldOpen && newClose === oldClose) return { restore: null, reminder: '' }
  const moRong = newOpen < oldOpen || newClose > oldClose
  const thuHep = newOpen > oldOpen || newClose < oldClose
  if (moRong && Number(b.soSanHoatDong ?? 0) > 0) {
    throw new ApiError(0, 'Muốn mở rộng giờ hoạt động, hãy khoá tất cả sân của cơ sở này ở trang Quản lý sân trước (sân phải không còn đơn đặt).')
  }
  let restore = null
  if (thuHep) {
    const bg = await callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { token })
    const goc = bg.khungGias ?? []
    const mapKhung = (k, start, end) => {
      const co7 = Array.isArray(k.giaTheoThu) && k.giaTheoThu.length === 7 && k.giaTheoThu.every((g) => g.giaKhachVangLai != null && g.giaKhachCoDinh != null)
      return co7
        ? { gioBatDau: start, gioKetThuc: end, giaTheoThu: k.giaTheoThu }
        : {
            gioBatDau: start,
            gioKetThuc: end,
            giaNgayThuongKhachVangLai: k.giaNgayThuongKhachVangLai,
            giaNgayThuongKhachCoDinh: k.giaNgayThuongKhachCoDinh,
            giaCuoiTuanKhachVangLai: k.giaCuoiTuanKhachVangLai,
            giaCuoiTuanKhachCoDinh: k.giaCuoiTuanKhachCoDinh,
          }
    }
    const moi = []
    let doi = false
    goc.forEach((k) => {
      const start = toMinutes(cut5(k.gioBatDau)) < toMinutes(newOpen) ? newOpen : cut5(k.gioBatDau)
      const end = toMinutes(cut5(k.gioKetThuc)) > toMinutes(newClose) ? newClose : cut5(k.gioKetThuc)
      if (toMinutes(end) <= toMinutes(start)) {
        doi = true
        return
      }
      if (start !== cut5(k.gioBatDau) || end !== cut5(k.gioKetThuc)) doi = true
      moi.push(mapKhung(k, start, end))
    })
    if (doi) {
      if (moi.length === 0) throw new ApiError(0, 'Không còn khung giá nào nằm trong giờ hoạt động mới. Hãy thêm khung giá phù hợp ở Quản lý bảng giá trước.')
      await callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { method: 'PUT', token, body: { khungGias: moi } })
      restore = () => callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { method: 'PUT', token, body: { khungGias: goc.map((k) => mapKhung(k, cut5(k.gioBatDau), cut5(k.gioKetThuc))) } }).catch(() => {})
    }
  }
  const reminder = moRong
    ? `Giờ hoạt động đã mở rộng: hãy bổ sung bảng giá cho phần giờ mới ở Quản lý bảng giá (bảng giá phải phủ hết ${newOpen}–${newClose}) rồi mới mở lại các sân.`
    : ''
  return { restore, reminder }
}

// Tự tải lại dữ liệu mỗi 45 giây (trong khoảng 30–60 giây) để thông tin luôn mới; bỏ qua khi tab đang ẩn.
// Trang dùng kết quả (tick) làm một phần phụ thuộc của useEffect tải dữ liệu.
function useAutoRefresh(ms = 45000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1)
    }, ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}

// Giá của một khung giờ theo từng thứ (1 = Thứ 2 … 7 = Chủ nhật): backend trả `giaTheoThu` (7 thứ riêng); thiếu thì dùng 4 trường cũ (T2–T6 / T7–CN).
function giaCuaThu(k, thu, coDinh = false) {
  const g = Array.isArray(k.giaTheoThu) ? k.giaTheoThu.find((x) => x.thu === thu) : null
  if (g) return (coDinh ? g.giaKhachCoDinh : g.giaKhachVangLai) ?? null
  const cuoi = thu >= 6
  const v = coDinh ? (cuoi ? k.giaCuoiTuanKhachCoDinh : k.giaNgayThuongKhachCoDinh) : cuoi ? k.giaCuoiTuanKhachVangLai : k.giaNgayThuongKhachVangLai
  return v ?? null
}
const thuTuJs = (getDay) => (getDay === 0 ? 7 : getDay) // getDay(): 0 = Chủ nhật → 7

// Giá (đ/giờ, khách vãng lai) của cơ sở tại một thời điểm theo bảng giá (giá riêng từng thứ)
function priceAt(khungGias, thoiDiem) {
  const phut = thoiDiem.getHours() * 60 + thoiDiem.getMinutes()
  const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && phut < toMinutes(cut5(x.gioKetThuc)))
  if (!k) return null
  const gia = giaCuaThu(k, thuTuJs(thoiDiem.getDay()))
  return gia == null ? null : Number(gia)
}

// Ngân hàng trong nước (nhà nước, và Techcombank/MB Bank theo yêu cầu). `code` là mã ngân hàng
// đúng với danh sách của API (GET /api/tai-khoan/ngan-hang); API chỉ nhận mã, tên do BE tự lấy.
const BANKS = [
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'CTG', name: 'VietinBank' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'VBA', name: 'Agribank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'MB', name: 'MB Bank' },
]

// Biểu tượng cho menu và tiêu đề trang (SVG, giúp người mới dùng web dễ phân biệt các trang)
const NAV_ICONS = {
  branches: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />,
  courts: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M12 5v14M3 12h18" />
    </>
  ),
  bookings: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 14l2 2 4-4" />
    </>
  ),
  refunds: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 8v8M9.5 14.5c.5 1 1.4 1.5 2.5 1.5 1.4 0 2.5-.7 2.5-1.8s-1-1.5-2.5-1.9-2.5-.8-2.5-1.9S10.6 8 12 8c1 0 1.9.5 2.4 1.3" />
    </>
  ),
  complaints: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v4M12 14h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  pricing: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  reviews: <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3" />,
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  overview: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  profile: <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
}
function NavIcon({ id, size = 18 }) {
  return (
    <svg className="nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[id] ?? NAV_ICONS.overview}
    </svg>
  )
}

// Biểu tượng cờ lê và thùng rác (SVG)
const WrenchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)
// Ổ khoá đóng (sân đang bị khoá) và ổ khoá mở (sân đang hoạt động)
const LockClosedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
const LockOpenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
)
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

// Ảnh do backend lưu ở /tep-tai-len/... nên ghép với địa chỉ backend
function fileUrl(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : `${API_URL}${path}`
}

const INITIAL_COURTS = [
  { id: 1, name: 'Green Smash Arena', branch: 'Quận 3', price: 90000, active: true },
  { id: 2, name: 'Sky Court Bình Thạnh', branch: 'Bình Thạnh', price: 110000, active: true },
  { id: 3, name: 'Ace Badminton Club', branch: 'Quận 10', price: 80000, active: true },
  { id: 4, name: 'Rally Hub Phú Nhuận', branch: 'Phú Nhuận', price: 120000, active: true },
  { id: 5, name: 'Vợt Xanh Thảo Điền', branch: 'Thủ Đức', price: 100000, active: true },
  { id: 6, name: 'Smash Point Tân Bình', branch: 'Tân Bình', price: 95000, active: true },
]

// Dữ liệu mẫu giả lập đơn khách đã đặt và chuyển tiền trên app (chưa có API chủ sân lấy đơn đặt): mặc định 'Đã đặt'
const INITIAL_BOOKINGS = [
  { code: 'BD26082101', customer: 'Minh Anh', court: 'Sân 1', date: todayISO(), time: '18:00', gioBatDau: '18:00', gioKetThuc: '20:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26082072', customer: 'Trần Gia Huy', court: 'Sân 2', date: todayISO(), time: '19:00', gioBatDau: '19:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081709', customer: 'Lê Thu Hà', court: 'Sân 3', date: todayISO(), time: '17:00', gioBatDau: '17:00', gioKetThuc: '18:30', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26082110', customer: 'Nguyễn Văn An', court: 'Sân 1', date: todayISO(), time: '20:00', gioBatDau: '20:00', gioKetThuc: '21:30', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081001', customer: 'Hoàng Mai', court: 'Sân 1', date: addDaysISO(-1), time: '07:00', gioBatDau: '07:00', gioKetThuc: '09:00', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26081002', customer: 'Đỗ Minh', court: 'Sân 2', date: addDaysISO(-1), time: '18:00', gioBatDau: '18:00', gioKetThuc: '20:00', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26081003', customer: 'Vũ Lan', court: 'Sân 1', date: addDaysISO(1), time: '19:00', gioBatDau: '19:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081645', customer: 'Phạm Quốc Bảo', court: 'Sân 3', date: todayISO(), time: '20:00', gioBatDau: '20:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
]

// Trạng thái cố định cho ngày mặc định (khớp thiết kế)
const BASE_SCHEDULE = {
  'Green Smash Arena': ['trống', 'đã đặt', 'trống', 'trống'],
  'Sky Court Bình Thạnh': ['trống', 'trống', 'đã đặt', 'trống'],
  'Ace Badminton Club': ['đang giữ', 'trống', 'trống', 'trống'],
  'Rally Hub Phú Nhuận': ['trống', 'trống', 'trống', 'trống'],
  'Vợt Xanh Thảo Điền': ['trống', 'trống', 'trống', 'trống'],
  'Smash Point Tân Bình': ['trống', 'trống', 'trống', 'bảo trì'],
}

const STATUS_CLASS = {
  'trống': 'free',
  'đã đặt': 'booked',
  'đang giữ': 'hold',
  'bảo trì': 'maint',
}

const WEEKLY = [
  { day: 'T2', value: 310 },
  { day: 'T3', value: 450 },
  { day: 'T4', value: 390 },
  { day: 'T5', value: 580 },
  { day: 'T6', value: 620 },
  { day: 'T7', value: 740 },
  { day: 'CN', value: 510 },
]

const Y_TICKS = [800, 700, 600, 500, 400, 300, 200, 100, 0]

/* ============================================================
   Hàm tiện ích
   ============================================================ */

const formatVnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`

// ---- Sắp xếp bảng (dùng chung cho mọi bảng): ô "Sắp xếp" giống trang Quản lý đặt sân. Giá trị rỗng = thứ tự mặc định.
// cols: [{ key, label, type: 'text' | 'number' | 'date' | 'time', get: (dòng) => giá trị }]. Dòng thiếu giá trị luôn xếp cuối.
const SORT_NHAN = {
  text: [['asc', 'A → Z'], ['desc', 'Z → A']],
  number: [['asc', 'thấp → cao'], ['desc', 'cao → thấp']],
  date: [['desc', 'mới nhất → cũ nhất'], ['asc', 'cũ nhất → mới nhất']],
  time: [['asc', 'sớm → muộn'], ['desc', 'muộn → sớm']],
}
function sortRows(rows, cols, sel) {
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
// Tiêu đề cột bấm để sắp xếp: bấm lần 1 = chiều đầu, bấm lần 2 = chiều ngược lại, bấm lần 3 = về mặc định. Bấm cột khác thì đổi sang cột đó.
function SortTh({ cols, k, sel, onSel, children }) {
  const col = cols.find((c) => c.key === k)
  const [key, dir] = (sel || '').split('|')
  const active = key === k
  const [truoc, sau] = SORT_NHAN[col.type].map((x) => x[0])
  const bam = () => onSel(!active ? `${k}|${truoc}` : dir === truoc ? `${k}|${sau}` : '')
  return (
    <th className={col.num ? 'num' : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={bam} title="Bấm để sắp xếp theo cột này">
        {children}
        <span className={`sort-ind${active ? ' on' : ''}`} aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  )
}
const ngayGioKey = (ngay, gio) => `${String(ngay ?? '').slice(0, 10)} ${String(gio ?? '').slice(0, 5)}`

// Bỏ dấu để tìm kiếm tiếng Việt dễ hơn ("minh anh" khớp "Minh Anh")
const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()

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

/* ============================================================
   Component dùng chung
   ============================================================ */

function Page({ subtitle, children }) {
  return (
    <>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {children}
      {/* <p className="note">
        Prototype tương tác · Dữ liệu, thanh toán, xác nhận và check-in chỉ là mô phỏng trong phiên hiện tại.
      </p> */}
    </>
  )
}

function Alert({ type = 'idle', children }) {
  return (
    <div className={`alert alert-${type}`} role="status">
      {children}
    </div>
  )
}

function Filters({ date, setDate, branch, setBranch, branches }) {
  return (
    <div className="filters">
      <label className="field">
        <span>Ngày</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Cơ sở</span>
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

function BarChart({ data, max = 800, ticks = Y_TICKS, label = 'Biểu đồ doanh thu', onSelect }) {
  const [hover, setHover] = useState(null) // { i: cột, key: phần màu đang trỏ chuột }
  return (
    <div className="chart" role="img" aria-label={label}>
      <div className="chart-y">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          {ticks.map((t) => (
            <div key={t} className="chart-line" />
          ))}
        </div>
        <div className="chart-bars" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
          {data.map((d, i) => {
            const hoverPart = d.parts && hover?.i === i ? d.parts.find((p) => p.key === hover.key) : null
            return (
              <div
                key={d.day}
                className={`chart-col${i < 2 ? ' tip-left' : ''}${i >= data.length - 2 ? ' tip-right' : ''}${onSelect ? ' is-clickable' : ''}`}
                tabIndex={0}
                onMouseLeave={() => setHover(null)}
                onClick={onSelect ? () => onSelect(i) : undefined}
                onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i) } } : undefined}
              >
                {d.parts ? (
                  // Cột chồng: đỏ = chuyển khoản (dưới), xanh dương = tiền mặt (trên)
                  <div className="chart-bar chart-bar-stack" style={{ '--v': d.value / max }}>
                    {d.parts.map((p) => (
                      <div
                        key={p.key}
                        className={`chart-seg seg-${p.key}${hover?.i === i && hover.key === p.key ? ' is-hover' : ''}`}
                        style={{ flexGrow: p.amount, flexBasis: 0 }}
                        onMouseEnter={() => setHover({ i, key: p.key })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="chart-bar" style={{ '--v': d.value / max }} />
                )}
                <span className="chart-x">{d.day}</span>
                {d.tip && (
                  <div className="chart-tip" role="tooltip">
                    <strong>{d.tipTitle}</strong>
                    {d.tip.map(([k, v]) => (
                      <div key={k} className="chart-tip-row">
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                    {hoverPart && (
                      <div className={`chart-tip-row chart-tip-part seg-text-${hoverPart.key}`}>
                        <span>{hoverPart.label}</span>
                        <b>{formatVnd(hoverPart.amount)}</b>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Các trang
   ============================================================ */

const WEEK_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const pad2 = (n) => String(n).padStart(2, '0')

const parseISO = (str) => {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const isoOf = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
const addDays = (str, n) => {
  const dt = parseISO(str)
  dt.setDate(dt.getDate() + n)
  return isoOf(dt)
}
// Thứ 2 của tuần chứa ngày đã chọn
const mondayOf = (str) => addDays(str, -((parseISO(str).getDay() + 6) % 7))
// Thứ 2 → giá trị của ô chọn tuần "YYYY-Www" (tuần ISO) và ngược lại
function weekValueOf(mondayIso) {
  const thu = parseISO(addDays(mondayIso, 3)) // thứ 5 quyết định năm của tuần ISO
  const dayOfYear = Math.round((thu - new Date(thu.getFullYear(), 0, 1)) / 86400000) + 1
  return `${thu.getFullYear()}-W${pad2(Math.floor((dayOfYear - 1) / 7) + 1)}`
}
function mondayOfWeekValue(value) {
  const m = /^(\d{4})-W(\d{2})$/.exec(value)
  if (!m) return null
  const jan4 = `${m[1]}-01-04`
  return addDays(mondayOf(jan4), (Number(m[2]) - 1) * 7)
}

const toViDate = (iso) => iso.split('-').reverse().join('/')

// Chia thang đo biểu đồ (đơn vị: nghìn đồng) thành tối đa 8 khoảng đẹp
function niceScale(maxVal) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
  const step = steps.find((s) => Math.ceil(maxVal / s) <= 8) ?? steps[steps.length - 1]
  const max = Math.max(step, Math.ceil(maxVal / step) * step)
  const ticks = []
  for (let t = max; t >= 0; t -= step) ticks.push(t)
  return { max, ticks }
}

// Chi tiết doanh thu theo từng sân của một ngày (xem theo tuần) hoặc một tháng (xem theo tháng).
// Dùng API có sẵn: GET /api/chu-san/san?maCoSo= và GET /api/chu-san/dat-san?maCoSo=&tuNgay=&denNgay=&soDong=200&trang=
// Cách tính giống backend (bao-cao/doanh-thu): đơn app đã xác nhận/check-in/hoàn thành, hoặc đơn app đã huỷ sau khi thanh toán (trừ tiền đã hoàn)
// = online (chuyển khoản); đơn chủ sân tạo đã bấm "Thu tiền" = offline (tiền mặt).
async function layDonTheoKhoang(token, maCoSo, tuNgay, denNgay) {
  const ketQua = []
  for (let trang = 1; trang <= 25; trang++) {
    const data = await callApi(`/api/chu-san/dat-san?maCoSo=${maCoSo}&tuNgay=${tuNgay}&denNgay=${denNgay}&soDong=200&trang=${trang}`, { token })
    const ds = data.cacDon ?? []
    ketQua.push(...ds)
    if (ds.length === 0 || ketQua.length >= Number(data.tong ?? 0)) break
  }
  return ketQua
}
function gomDoanhThuTheoSan(cacSan, cacDon) {
  const choi = ['confirmed', 'checked_in', 'completed']
  const map = new Map(cacSan.map((s) => [s.maSan, { maSan: s.maSan, tenSan: s.tenSan, luot: 0, online: 0, offline: 0 }]))
  for (const d of cacDon) {
    let r = map.get(d.maSan)
    if (!r) {
      r = { maSan: d.maSan, tenSan: d.tenSan, luot: 0, online: 0, offline: 0 }
      map.set(d.maSan, r)
    }
    const tien = Number(d.tongTien) || 0
    if (d.nguon === 'owner') {
      if (d.trangThaiThu === 'paid' && choi.includes(d.trangThai)) {
        r.luot += 1
        r.offline += tien
      }
    } else if (choi.includes(d.trangThai)) {
      r.luot += 1
      r.online += tien
    } else if (d.trangThai === 'cancelled' && d.trangThaiThanhToan === 'success') {
      const hoan = ['refunded', 'received'].includes(d.trangThaiHoanTien) ? Math.min(tien, Number(d.soTienHoan) || 0) : 0
      r.online += tien - hoan
    }
  }
  return [...map.values()].map((r) => ({ ...r, tong: r.online + r.offline }))
}
const REVENUE_SORT_COLS = [
  { key: 'san', label: 'Sân', type: 'text', get: (r) => r.tenSan },
  { key: 'luot', label: 'Số lần hoạt động', type: 'number', num: true, get: (r) => r.luot },
  { key: 'online', label: 'Online (Chuyển khoản)', type: 'number', num: true, get: (r) => r.online },
  { key: 'offline', label: 'Offline (Tiền mặt)', type: 'number', num: true, get: (r) => r.offline },
  { key: 'tong', label: 'Tổng doanh thu', type: 'number', num: true, get: (r) => r.tong },
]
function RevenueDetailDialog({ token, maCoSo, tenCoSo, tuNgay, denNgay, title, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [sortSel, setSortSel] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([callApi(`/api/chu-san/san?maCoSo=${maCoSo}`, { token }), layDonTheoKhoang(token, maCoSo, tuNgay, denNgay)])
      .then(([cacSan, cacDon]) => {
        if (!cancelled) setRows(gomDoanhThuTheoSan(cacSan, cacDon))
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, maCoSo, tuNgay, denNgay])

  const tong = (rows ?? []).reduce((a, r) => ({ luot: a.luot + r.luot, online: a.online + r.online, offline: a.offline + r.offline, tong: a.tong + r.tong }), { luot: 0, online: 0, offline: 0, tong: 0 })

  return (
    <Dialog title={`Doanh thu các sân · ${title}`} width={760} fit onClose={onClose}>
      <p className="picker-hint">
        {tenCoSo}. Online (Chuyển khoản) = khách chuyển khoản qua hệ thống (đã trừ tiền hoàn); Offline (Tiền mặt) = đơn chủ sân tạo đã bấm “Thu tiền”.
      </p>
      {error && <p className="dialog-error">{error}</p>}
      <div className="table-scroll dialog-table-scroll">
        <table className="table table-revenue-detail">
          <thead>
            <tr>
              {REVENUE_SORT_COLS.map((c) => (
                <SortTh key={c.key} cols={REVENUE_SORT_COLS} k={c.key} sel={sortSel} onSel={setSortSel}>
                  {c.label}
                </SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Đang tải...
                </td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Cơ sở chưa có sân nào.
                </td>
              </tr>
            )}
            {sortRows(rows ?? [], REVENUE_SORT_COLS, sortSel).map((r) => (
              <tr key={r.maSan}>
                <td>{r.tenSan}</td>
                <td className="num">{r.luot}</td>
                <td className="num">{formatVnd(r.online)}</td>
                <td className="num">{formatVnd(r.offline)}</td>
                <td className="num">
                  <strong>{formatVnd(r.tong)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr className="revenue-total">
                <td>Tổng cộng</td>
                <td className="num">{tong.luot}</td>
                <td className="num">{formatVnd(tong.online)}</td>
                <td className="num">{formatVnd(tong.offline)}</td>
                <td className="num">{formatVnd(tong.tong)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}

function Overview({ user, onNavigate }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [date, setDate] = useState(todayISO())
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO())) // Thứ 2 của tuần đang xem
  const [year, setYear] = useState(() => Number(todayISO().slice(0, 4))) // năm đang xem ở dạng "Tháng"
  const [branches, setBranches] = useState([])
  const [maCoSo, setMaCoSo] = useState(null)
  const [activeCourts, setActiveCourts] = useState(0)
  const [revenueByDay, setRevenueByDay] = useState({}) // ngày → { revenue, count } của tuần đang xem
  const [revenueByMonth, setRevenueByMonth] = useState({}) // tháng (1-12) → { revenue, count } của năm đang xem
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const [range, setRange] = useState('week') // biểu đồ xem theo tuần hoặc tháng
  const [dayStats, setDayStats] = useState(null) // { count, revenue } của ngày đã chọn (null = đang tải)
  const [detail, setDetail] = useState(null) // cửa sổ chi tiết doanh thu các sân: { tuNgay, denNgay, title }
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')

  // Danh sách cơ sở: API có sẵn GET /api/chu-san/co-so
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((list) => {
        if (cancelled) return
        const all = Array.isArray(list) ? list : []
        setBranches(all)
        setMaCoSo((prev) => prev ?? (all.find((b) => !isBranchBlocked(b)) ?? all[0])?.maCoSo ?? null)
        if (all.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])

  // Số sân hoạt động + doanh thu của tuần (hoặc của cả năm khi xem theo tháng): API có sẵn
  // GET /api/chu-san/san?maCoSo= và GET /api/chu-san/bao-cao/doanh-thu?maCoSo=&tuNgay=&denNgay= | &nam=
  useEffect(() => {
    if (!isOwner || !maCoSo) return
    let cancelled = false
    async function load() {
      try {
        const loc = range === 'week' ? `tuNgay=${weekStart}&denNgay=${addDays(weekStart, 6)}` : `nam=${year}`
        const [cacSan, doanhThu] = await Promise.all([
          callApi(`/api/chu-san/san?maCoSo=${maCoSo}`, { token }),
          callApi(`/api/chu-san/bao-cao/doanh-thu?maCoSo=${maCoSo}&${loc}`, { token }),
        ])
        if (cancelled) return
        setActiveCourts(cacSan.filter((c) => c.trangThai === 'active').length)
        if (range === 'week') {
          const byDay = {}
          doanhThu.theoNgay.forEach((r) => {
            const cash = Number(r.doanhThuNgoaiHeThong ?? 0)
            byDay[String(r.ngay).slice(0, 10)] = { revenue: Number(r.doanhThu), count: Number(r.soLuotDat), cash, transfer: Math.max(0, Number(r.doanhThu) - cash) }
          })
          setRevenueByDay(byDay)
        } else {
          const byMonth = {}
          doanhThu.theoThang.forEach((r) => {
            const cash = Number(r.doanhThuNgoaiHeThong ?? 0)
            byMonth[Number(r.thang)] = { revenue: Number(r.doanhThu), count: Number(r.soLuotDat), cash, transfer: Math.max(0, Number(r.doanhThu) - cash) }
          })
          setRevenueByMonth(byMonth)
        }
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSo, range, weekStart, year, tick])

  // Lịch đặt + doanh thu của ngày đã chọn: GET /api/chu-san/dat-san?ngay= (đếm đơn confirmed + completed)
  // và GET /api/chu-san/bao-cao/doanh-thu?tuNgay=&denNgay= (cùng một ngày)
  useEffect(() => {
    if (!isOwner || !maCoSo || !date) return
    let cancelled = false
    Promise.all([
      callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSo}&soDong=200`, { token }),
      callApi(`/api/chu-san/bao-cao/doanh-thu?maCoSo=${maCoSo}&tuNgay=${date}&denNgay=${date}`, { token }),
    ])
      .then(([datSan, doanhThu]) => {
        if (cancelled) return
        const paid = datSan.cacDon.filter((d) => d.trangThai === 'confirmed' || d.trangThai === 'completed')
        // Tiền mặt = đơn chủ sân tạo bằng nút "Tạo đơn" (thu ngoài hệ thống); chuyển khoản = phần còn lại (khách thanh toán qua hệ thống, đã trừ tiền hoàn)
        const cash = Number(doanhThu.tongCong.doanhThuNgoaiHeThong ?? 0)
        const revenue = Number(doanhThu.tongCong.doanhThu)
        setDayStats({ count: paid.length, revenue, cash, transfer: Math.max(0, revenue - cash) })
      })
      .catch((err) => {
        if (!cancelled) {
          setDayStats({ count: 0, revenue: 0 })
          setError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSo, date, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const show = (v) => (loading ? '...' : v)
  const stats = [
    { label: 'Lịch đặt trong ngày', value: show(dayStats?.count ?? '...') },
    { label: 'Tổng doanh thu trong ngày', value: show(dayStats ? formatVnd(dayStats.revenue) : '...') },
    { label: 'Sân hoạt động', value: show(activeCourts) },
    { label: 'Doanh thu chuyển khoản', value: show(dayStats ? formatVnd(dayStats.transfer) : '...') },
    { label: 'Doanh thu tiền mặt', value: show(dayStats ? formatVnd(dayStats.cash) : '...') },
  ]

  // Dữ liệu cột. Backend không lưu lịch sử số sân hoạt động nên "Sân hoạt động" là số sân đang hoạt động hiện tại.
  const chartData =
    range === 'week'
      ? WEEK_LABELS.map((label, i) => {
          const iso = addDays(weekStart, i)
          const r = revenueByDay[iso] ?? { revenue: 0, count: 0, cash: 0, transfer: 0 }
          return {
            day: label,
            value: Math.round(r.revenue / 1000),
            parts: [
              { key: 'transfer', label: 'Doanh thu chuyển khoản', amount: r.transfer },
              { key: 'cash', label: 'Doanh thu tiền mặt', amount: r.cash },
            ],
            tipTitle: `${label} · ${toViDate(iso)}`,
            tip: [
              ['Lịch đặt trong ngày', r.count],
              ['Tổng doanh thu trong ngày', formatVnd(r.revenue)],
              ['Sân hoạt động', activeCourts],
            ],
          }
        })
      : Array.from({ length: 12 }, (_, i) => {
          const r = revenueByMonth[i + 1] ?? { revenue: 0, count: 0, cash: 0, transfer: 0 }
          return {
            day: `Th${i + 1}`,
            value: Math.round(r.revenue / 1000),
            parts: [
              { key: 'transfer', label: 'Doanh thu chuyển khoản', amount: r.transfer },
              { key: 'cash', label: 'Doanh thu tiền mặt', amount: r.cash },
            ],
            tipTitle: `Tháng ${i + 1}/${year}`,
            tip: [
              ['Tổng doanh thu tháng', formatVnd(r.revenue)],
              ['Tổng lịch đặt', r.count],
              ['Sân hoạt động (nhiều nhất)', activeCourts],
            ],
          }
        })
  const scale = niceScale(Math.max(0, ...chartData.map((w) => w.value)))
  const weekEnd = addDays(weekStart, 6)
  // Bấm cột: xem theo tuần → đúng ngày của cột; xem theo tháng → cả tháng của cột
  const openDetail = (i) => {
    if (range === 'week') {
      const iso = addDays(weekStart, i)
      setDetail({ tuNgay: iso, denNgay: iso, title: `${WEEK_LABELS[i]} ${toViDate(iso)}` })
    } else {
      const m = i + 1
      const lastDay = new Date(year, m, 0).getDate()
      setDetail({ tuNgay: `${year}-${pad2(m)}-01`, denNgay: `${year}-${pad2(m)}-${pad2(lastDay)}`, title: `Tháng ${m}/${year}` })
    }
  }

  return (
    <Page subtitle="">
      {error && <Alert type="error">{error}</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput
            value={date}
            ariaLabel="Chọn ngày"
            onChange={(v) => {
              setDate(v)
              if (v) {
                setWeekStart(mondayOf(v))
                setYear(Number(v.slice(0, 4)))
              }
            }}
          />
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={maCoSo ?? ''} onChange={(e) => setMaCoSo(Number(e.target.value))} disabled={branches.length < 2}>
            {branches.map((b) => (
              <option key={b.maCoSo} value={b.maCoSo} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stats stats-5">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <section className="card chart-card">
        <div className="chart-head">
          <h2>
            {range === 'week'
              ? `Doanh thu theo tuần (${toViDate(weekStart)} – ${toViDate(weekEnd)}) · nghìn đồng`
              : `Doanh thu theo tháng năm ${year} · nghìn đồng`}
          </h2>
          <div className="actions">
            {range === 'week' ? (
              <div className="period-picker">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước">
                  ‹
                </button>
                <input
                  type="week"
                  value={weekValueOf(weekStart)}
                  onChange={(e) => {
                    const monday = mondayOfWeekValue(e.target.value)
                    if (monday) setWeekStart(monday)
                  }}
                  aria-label="Chọn tuần"
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau">
                  ›
                </button>
              </div>
            ) : (
              <div className="period-picker">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year - 1)} aria-label="Năm trước">
                  ‹
                </button>
                <strong className="period-year">{year}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year + 1)} aria-label="Năm sau">
                  ›
                </button>
              </div>
            )}
            <button type="button" className={`btn btn-sm ${range === 'week' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('week')}>
              Tuần
            </button>
            <button type="button" className={`btn btn-sm ${range === 'month' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('month')}>
              Tháng
            </button>
          </div>
        </div>
        <div className="chart-legend" aria-label="Chú thích màu cột doanh thu">
          <span className="chart-legend-item">
            <i className="chart-legend-box seg-transfer" /> Doanh thu chuyển khoản
          </span>
          <span className="chart-legend-item">
            <i className="chart-legend-box seg-cash" /> Doanh thu tiền mặt
          </span>
        </div>
        <BarChart data={chartData} max={scale.max} ticks={scale.ticks} onSelect={maCoSo ? openDetail : undefined} label={range === 'week' ? 'Biểu đồ doanh thu theo tuần (bấm vào cột để xem chi tiết từng sân)' : 'Biểu đồ doanh thu theo tháng (bấm vào cột để xem chi tiết từng sân)'} />
        <p className="hint">Bấm vào một cột để xem doanh thu từng sân của {range === 'week' ? 'ngày' : 'tháng'} đó.</p>
      </section>

      {detail && maCoSo && (
        <RevenueDetailDialog
          token={token}
          maCoSo={maCoSo}
          tenCoSo={branches.find((b) => b.maCoSo === maCoSo)?.tenCoSo ?? ''}
          tuNgay={detail.tuNgay}
          denNgay={detail.denNgay}
          title={detail.title}
          onClose={() => setDetail(null)}
        />
      )}
    </Page>
  )
}

// Đổi "HH:mm" thành vị trí cột (mỗi cột = 30 phút, cột 0 = 06:00)
function slotIndex(time, openMin) {
  return Math.floor((toMinutes(time) - openMin) / SLOT_MIN)
}

// Dựng các ô của một sân: mỗi thanh (đơn đặt hoặc khoá sân) đi từ giờ bắt đầu đến giờ kết thúc
// (không gồm mốc kết thúc) gộp thành MỘT ô; mốc kết thúc vẫn trống để khách khác đặt tiếp từ đó.
function buildCourtCells(bars, total, openMin) {
  const sorted = [...bars].sort((a, b) => slotIndex(a.gioBatDau, openMin) - slotIndex(b.gioBatDau, openMin))
  const cells = []
  let i = 0
  while (i < total) {
    const dat = sorted.find((b) => Math.max(slotIndex(b.gioBatDau, openMin), 0) === i && slotIndex(b.gioKetThuc, openMin) > i)
    if (dat) {
      const end = Math.min(slotIndex(dat.gioKetThuc, openMin), total)
      cells.push({ key: `dat-${i}`, span: end - i, dat })
      i = end
    } else {
      cells.push({ key: `trong-${i}`, span: 1, dat: null })
      i += 1
    }
  }
  return cells
}

// Ô nhập ngày luôn hiển thị dạng ngày/tháng/năm (không phụ thuộc ngôn ngữ trình duyệt); bấm vào để mở lịch chọn ngày.
function ViDateInput({ value, onChange, disabled = false, min, ariaLabel = 'Chọn ngày' }) {
  const ref = useRef(null)
  const openPicker = () => {
    const el = ref.current
    if (!el || disabled) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }
  return (
    <span className={`vi-date${disabled ? ' is-disabled' : ''}`}>
      <button type="button" className="vi-date-btn" onClick={openPicker} disabled={disabled} aria-label={ariaLabel}>
        <span>{value ? toViDate(value) : 'dd/mm/yyyy'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input ref={ref} className="vi-date-native" type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
    </span>
  )
}

// Tổng giá của một lượt đặt theo bảng giá của cơ sở (cùng cách tính với backend: cộng từng ô 30 phút = giá/giờ ÷ 2,
// làm tròn theo từng ngày). Trả về null nếu có ô giờ chưa có giá.
function tinhTongGia(khungGias, cacNgay, gioBatDau, gioKetThuc, coDinh) {
  let tong = 0
  for (const ngay of cacNgay) {
    const thu = thuTuJs(new Date(`${ngay}T00:00:00Z`).getUTCDay())
    let ngayTien = 0
    for (let phut = toMinutes(gioBatDau); phut < toMinutes(gioKetThuc); phut += SLOT_MIN) {
      const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && toMinutes(cut5(x.gioKetThuc)) >= phut + SLOT_MIN)
      if (!k) return null
      const gia = giaCuaThu(k, thu, coDinh)
      if (gia == null) return null
      ngayTien += Number(gia) / 2
    }
    tong += Math.round(ngayTien)
  }
  return tong
}

// Cửa sổ "Khoá khung giờ" (bảo trì một khung giờ của sân, không phải khoá cả sân).
// API có sẵn: GET/POST /api/chu-san/khoa-san, DELETE /api/chu-san/khoa-san/:maKhoa,
// GET /api/chu-san/dat-san (tìm đơn trùng giờ), POST /api/chu-san/dat-san/:maDatSan/huy (huỷ đơn trùng giờ, khách được hoàn tiền).
// API khoá sân chỉ nhận 1 ngày mỗi lần → khoá nhiều ngày thì gọi lần lượt từng ngày (tối đa 90 ngày).
function LockCourtDialog({ token, courts, branch, defaultCourtId, defaultDate, onClose, onChanged }) {
  const openMin = toMinutes(cut5(branch.gioMoCua))
  const closeMin = toMinutes(cut5(branch.gioDongCua))
  const times = slotTimes(openMin, closeMin)
  const [maSan, setMaSan] = useState(String(defaultCourtId ?? courts[0]?.maSan ?? ''))
  const [tuNgay, setTuNgay] = useState(defaultDate)
  const [denNgay, setDenNgay] = useState(defaultDate)
  const [tuGio, setTuGio] = useState(times[0])
  const [denGio, setDenGio] = useState(times[times.length - 1])
  const [lyDo, setLyDo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [giuLai, setGiuLai] = useState(null) // đơn của khách được giữ nguyên sau lần khoá vừa rồi
  const [locks, setLocks] = useState([])
  const [reload, setReload] = useState(0)

  const soNgay = tuNgay && denNgay && tuNgay <= denNgay ? eachDay(tuNgay, denNgay).length : 0

  // Khoá sắp tới của sân đang chọn
  useEffect(() => {
    if (!maSan) return
    let cancelled = false
    callApi(`/api/chu-san/khoa-san?maSan=${maSan}&tuNgay=${encodeURIComponent(`${todayISO()} 00:00`)}`, { token })
      .then((data) => {
        if (!cancelled) setLocks(data)
      })
      .catch(() => {
        if (!cancelled) setLocks([])
      })
    return () => {
      cancelled = true
    }
  }, [token, maSan, reload])

  const resetKetQua = () => setGiuLai(null)

  const unlock = async (k) => {
    setError('')
    try {
      await callApi(`/api/chu-san/khoa-san/${k.maKhoa}`, { method: 'DELETE', token })
      setReload((n) => n + 1)
      onChanged()
    } catch (err) {
      setError(describeApiError(err))
    }
  }

  const validate = () => {
    if (!maSan) return 'Vui lòng chọn sân.'
    if (!tuNgay || !denNgay) return 'Vui lòng chọn ngày.'
    if (tuNgay > denNgay) return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'
    if (soNgay > MAX_RANGE_DAYS) return `Mỗi lần chỉ khoá tối đa ${MAX_RANGE_DAYS} ngày.`
    if (toMinutes(tuGio) >= toMinutes(denGio)) return 'Giờ kết thúc phải sau giờ bắt đầu.'
    return ''
  }

  // Khoá cả khung giờ của sân TRỪ phần đã có đơn của khách: API có sẵn POST /api/chu-san/khoa-san (dạng tuNgay/denNgay + gioBatDau/gioKetThuc)
  // chỉ khoá phần trống, cắt quanh các đơn đang giữ sân và trả lại các đơn đó ở `cacDonVuong` → đơn của khách giữ nguyên, vẫn hiện màu vàng.
  const submit = async () => {
    const loi = validate()
    if (loi) return setError(loi)
    setBusy(true)
    setError('')
    try {
      const kq = await callApi('/api/chu-san/khoa-san', {
        method: 'POST',
        token,
        body: {
          maSan: Number(maSan),
          tuNgay,
          denNgay,
          gioBatDau: tuGio,
          gioKetThuc: denGio,
          ...(lyDo.trim() ? { lyDo: lyDo.trim() } : {}),
        },
      })
      const giu = kq.cacDonVuong ?? []
      setGiuLai(giu)
      setReload((n) => n + 1)
      const daKhoa = Number(kq.soNgayKhoa ?? (kq.cacKhoa?.length ? 1 : 0))
      onChanged(
        daKhoa > 0
          ? `Đã khoá ${daKhoa} ngày, khung ${tuGio}–${denGio}.${giu.length ? ` ${giu.length} đơn của khách được giữ nguyên (vẫn hiện màu vàng trên lịch).` : ''}`
          : `Khung giờ này không còn phần trống để khoá (đã có đơn của khách hoặc đã bị khoá).${giu.length ? ` ${giu.length} đơn của khách được giữ nguyên.` : ''}`,
      )
    } catch (err) {
      setError(describeApiError(err))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const courtName = (id) => courts.find((c) => c.maSan === id)?.tenSan ?? ''

  return (
    <Dialog title="Khoá khung giờ" level={1} width={520} onClose={() => !busy && onClose()}>
      <label className="dialog-field">
        <span>Sân</span>
        <select className="input" value={maSan} onChange={(e) => { setMaSan(e.target.value); resetKetQua() }}>
          {courts.map((c) => (
            <option key={c.maSan} value={String(c.maSan)}>
              {c.tenSan}
            </option>
          ))}
        </select>
      </label>
      <div className="dlg-grid-2">
        <label className="dialog-field">
          <span>Từ ngày</span>
          <ViDateInput value={tuNgay} onChange={(v) => { setTuNgay(v); if (v > denNgay) setDenNgay(v); resetKetQua() }} ariaLabel="Từ ngày" />
        </label>
        <label className="dialog-field">
          <span>Đến ngày</span>
          <ViDateInput value={denNgay} min={tuNgay} onChange={(v) => { setDenNgay(v); resetKetQua() }} ariaLabel="Đến ngày" />
        </label>
        <label className="dialog-field">
          <span>Từ giờ (mỗi ngày)</span>
          <select className="input" value={tuGio} onChange={(e) => { setTuGio(e.target.value); if (toMinutes(e.target.value) >= toMinutes(denGio)) setDenGio(toHHMM(toMinutes(e.target.value) + SLOT_MIN)); resetKetQua() }}>
            {times.slice(0, -1).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Đến giờ (mỗi ngày)</span>
          <select className="input" value={denGio} onChange={(e) => { setDenGio(e.target.value); resetKetQua() }}>
            {times.filter((t) => toMinutes(t) > toMinutes(tuGio)).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="dialog-field">
        <span>Lý do (tuỳ chọn)</span>
        <input className="input" type="text" placeholder="VD: Bảo trì mặt sân" value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
      </label>

      <p className="dialog-note lock-info">
        Sẽ khoá <strong>{soNgay || 0} ngày</strong>, mỗi ngày cùng khung {tuGio}–{denGio}. Tối đa {MAX_RANGE_DAYS} ngày mỗi lần. Hệ thống khoá <strong>cả sân trừ phần đã có đơn của khách</strong>:
        đơn đã đặt được giữ nguyên (vẫn màu vàng, khách vẫn chơi bình thường), chỉ phần còn trống mới bị khoá.
      </p>

      {giuLai && giuLai.length > 0 && (
        <div className="conflict-box">
          <strong>{giuLai.length} đơn của khách được giữ nguyên:</strong>
          <ul>
            {giuLai.map((d) => (
              <li key={d.maDatSan}>
                {toViDate(String(d.ngay).slice(0, 10))} · {cut5(d.gioBatDau)}–{cut5(d.gioKetThuc)} · {d.tenKhach} · {courtName(Number(maSan))}
              </li>
            ))}
          </ul>
          <p>Muốn đổi sân cho các khách này, mở Quản lý đặt sân và bấm “Chuyển sân” ở đơn tương ứng.</p>
        </div>
      )}

      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy}>
          {busy ? 'Đang xử lý...' : 'Khoá khung giờ'}
        </button>
      </div>

      <h4 className="lock-list-title">Khoá sắp tới của sân này</h4>
      {locks.length === 0 ? (
        <p className="dialog-note">Chưa có khung giờ nào bị khoá.</p>
      ) : (
        <ul className="lock-list">
          {locks.map((k) => (
            <li key={k.maKhoa}>
              <span>
                {toViDate(k.thoiGianBatDau.slice(0, 10))} · {k.thoiGianBatDau.slice(11, 16)}–{k.thoiGianKetThuc.slice(11, 16)}
                {k.lyDo ? ` · ${k.lyDo}` : ''}
              </span>
              <button type="button" className="link-btn" onClick={() => unlock(k)}>
                Gỡ khoá
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

// Cửa sổ "Tạo đơn cho khách": chủ sân tự tạo đơn (khách vãng lai hoặc khách cố định nhiều ngày).
// API có sẵn: POST /api/chu-san/dat-san; tổng giá tính từ GET /api/chu-san/co-so/:maCoSo/bang-gia (giá chính thức do backend tính khi tạo đơn).
function CreateOrderDialog({ token, courts, branch, defaultCourtId, defaultDate, onClose, onCreated }) {
  const openMin = toMinutes(cut5(branch.gioMoCua))
  const closeMin = toMinutes(cut5(branch.gioDongCua))
  const times = slotTimes(openMin, closeMin)
  const gioToiThieu = 60 // thời gian chơi tối thiểu 1 tiếng
  const [maSan, setMaSan] = useState(String(defaultCourtId ?? courts[0]?.maSan ?? ''))
  const [ngay, setNgay] = useState(defaultDate)
  const homNay = todayISO()
  const nowMin = vnClock().getUTCHours() * 60 + vnClock().getUTCMinutes()
  // Backend chỉ nhận đơn có giờ bắt đầu SAU giờ hiện tại, nên ngày hôm nay chỉ liệt kê các mốc giờ còn lại
  const dsGioBatDau = (n) => times.filter((t) => toMinutes(t) + gioToiThieu <= closeMin && (n !== homNay || toMinutes(t) > nowMin))
  const [gioBatDau, setGioBatDau] = useState(() => dsGioBatDau(defaultDate)[0] ?? '')
  const [gioKetThuc, setGioKetThuc] = useState(() => (dsGioBatDau(defaultDate)[0] ? toHHMM(toMinutes(dsGioBatDau(defaultDate)[0]) + gioToiThieu) : ''))
  const [tenKhach, setTenKhach] = useState('')
  const [soDienThoai, setSoDienThoai] = useState('')
  const [ghiChu, setGhiChu] = useState('')
  const [daThu, setDaThu] = useState(false) // tích = đã thu tiền ngoài hệ thống → Đã thanh toán; không tích = Chờ thanh toán
  const [coDinh, setCoDinh] = useState(false)
  const [ngayKetThuc, setNgayKetThuc] = useState(defaultDate)
  const [khungGias, setKhungGias] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    callApi(`/api/chu-san/co-so/${branch.maCoSo}/bang-gia`, { token })
      .then((data) => {
        if (!cancelled) setKhungGias(data.khungGias ?? [])
      })
      .catch(() => {
        if (!cancelled) setKhungGias([])
      })
    return () => {
      cancelled = true
    }
  }, [token, branch.maCoSo])

  const startOptions = dsGioBatDau(ngay)
  // Đổi ngày (vd sang hôm nay) mà giờ đang chọn không còn hợp lệ thì chuyển sang mốc hợp lệ đầu tiên
  useEffect(() => {
    if (startOptions.length === 0) {
      // Hôm nay đã quá giờ hoạt động: giờ bắt đầu và giờ kết thúc đều không còn lựa chọn
      setGioBatDau('')
      setGioKetThuc('')
      return
    }
    if (!startOptions.includes(gioBatDau)) {
      setGioBatDau(startOptions[0])
      setGioKetThuc(toHHMM(toMinutes(startOptions[0]) + gioToiThieu))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ngay])
  const cacNgay = coDinh ? (ngay <= ngayKetThuc ? eachDay(ngay, ngayKetThuc) : []) : [ngay]
  const coGio = startOptions.length > 0 && Boolean(gioBatDau) && Boolean(gioKetThuc)
  const tongGia = khungGias && coGio ? tinhTongGia(khungGias, cacNgay, gioBatDau, gioKetThuc, coDinh && cacNgay.length > 1) : undefined

  const changeStart = (v) => {
    setGioBatDau(v)
    if (toMinutes(gioKetThuc) < toMinutes(v) + gioToiThieu) setGioKetThuc(toHHMM(toMinutes(v) + gioToiThieu))
  }

  const submit = async () => {
    if (!maSan) return setError('Vui lòng chọn sân.')
    if (!ngay) return setError('Vui lòng chọn ngày.')
    if (ngay < homNay) return setError('Không thể chọn ngày đã qua.')
    if (startOptions.length === 0) return setError('Hôm nay đã hết khung giờ có thể tạo đơn, vui lòng chọn ngày khác.')
    if (!gioBatDau || !gioKetThuc) return setError('Vui lòng chọn giờ bắt đầu và giờ kết thúc.')
    if (toMinutes(gioKetThuc) - toMinutes(gioBatDau) < gioToiThieu) return setError('Thời gian chơi tối thiểu 1 tiếng: giờ kết thúc phải sau giờ bắt đầu ít nhất 60 phút.')
    if (tenKhach.trim().length < 2) return setError('Vui lòng nhập tên khách (tối thiểu 2 ký tự).')
    if (!soDienThoai.trim()) return setError('Vui lòng nhập số điện thoại.')
    if (coDinh) {
      if (ngayKetThuc <= ngay) return setError('Khách cố định: ngày kết thúc phải sau ngày bắt đầu.')
      if (cacNgay.length > MAX_RANGE_DAYS) return setError(`Khách cố định đặt tối đa ${MAX_RANGE_DAYS} ngày mỗi lần.`)
    }
    setBusy(true)
    setError('')
    try {
      const kq = await callApi('/api/chu-san/dat-san', {
        method: 'POST',
        token,
        body: {
          maSan: Number(maSan),
          ngay,
          ...(coDinh ? { ngayKetThuc } : {}),
          gioBatDau,
          gioKetThuc,
          tenKhach: tenKhach.trim(),
          soDienThoai: soDienThoai.trim(),
          ...(ghiChu.trim() ? { ghiChu: ghiChu.trim() } : {}),
          daThu,
        },
      })
      onCreated(`Đã tạo đơn cho ${tenKhach.trim()} (${kq.soNgay} ngày, tổng ${formatVnd(kq.tongTien)}). ${daThu ? 'Đơn đã thanh toán.' : 'Đơn đang Chờ thanh toán; bấm "Thu tiền" ở Quản lý đặt sân khi khách trả tiền.'}`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Tạo đơn cho khách" level={1} width={520} onClose={() => !busy && onClose()}>
      <div className="dlg-grid-2">
        <label className="dialog-field">
          <span>Sân</span>
          <select className="input" value={maSan} onChange={(e) => setMaSan(e.target.value)}>
            {courts.map((c) => (
              <option key={c.maSan} value={String(c.maSan)}>
                {c.tenSan}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Ngày</span>
          <ViDateInput value={ngay} min={homNay} onChange={(v) => { if (!v) return; setNgay(v); if (v > ngayKetThuc) setNgayKetThuc(v) }} ariaLabel="Ngày" />
        </label>
        <label className="dialog-field">
          <span>Giờ bắt đầu</span>
          <select className="input" value={gioBatDau} onChange={(e) => changeStart(e.target.value)}>
            {startOptions.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Giờ kết thúc</span>
          <select className="input" value={gioKetThuc} onChange={(e) => setGioKetThuc(e.target.value)}>
            {(startOptions.length === 0 || !gioBatDau ? [] : times.filter((t) => toMinutes(t) >= toMinutes(gioBatDau) + gioToiThieu)).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Tên khách</span>
          <input className="input" type="text" placeholder="VD: Nguyễn Văn A" value={tenKhach} onChange={(e) => setTenKhach(e.target.value)} />
        </label>
        <label className="dialog-field">
          <span>Số điện thoại</span>
          <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} placeholder="VD: 0912345678" value={soDienThoai} onChange={(e) => setSoDienThoai(onlyDigits(e.target.value))} />
        </label>
      </div>
      <label className="dialog-field">
        <span>Ghi chú (tuỳ chọn)</span>
        <textarea className="input dlg-textarea" rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
      </label>
      <label className="dlg-check">
        <input type="checkbox" checked={daThu} onChange={(e) => setDaThu(e.target.checked)} />
        <span>
          <strong>Đã thu tiền ngoài hệ thống</strong>
          <small>Tích: đơn là Đã thanh toán, lên lịch và tính doanh thu ngay. Không tích: đơn Chờ thanh toán, thu tiền sau ở Quản lý đặt sân.</small>
        </span>
      </label>
      <label className="dlg-check">
        <input type="checkbox" checked={coDinh} onChange={(e) => setCoDinh(e.target.checked)} />
        <span>
          <strong>Khách cố định — đặt liên tiếp mỗi ngày đến ngày…</strong>
          <small>Mỗi ngày tạo 1 đơn cùng khung giờ, tối đa {MAX_RANGE_DAYS} ngày, tính theo giá khách cố định.</small>
        </span>
      </label>
      {coDinh && (
        <label className="dialog-field">
          <span>Đến ngày</span>
          <ViDateInput value={ngayKetThuc} min={ngay} onChange={setNgayKetThuc} ariaLabel="Đến ngày" />
        </label>
      )}

      <div className="dlg-total">
        <span>Tổng giá{coDinh && cacNgay.length > 1 ? ` (${cacNgay.length} ngày)` : ''}</span>
        <strong>{!coGio ? '' : tongGia === undefined ? 'Đang tính...' : tongGia === null ? 'Chưa có giá cho khung giờ này' : formatVnd(tongGia)}</strong>
      </div>

      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Huỷ
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy || !coGio}>
          {busy ? 'Đang tạo...' : 'Tạo đơn'}
        </button>
      </div>
    </Dialog>
  )
}

function CourtMatrix({ user }) {
  const [date, setDate] = useState(todayISO) // mặc định là ngày hiện tại
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState(readLastBranch) // mặc định: cơ sở được chọn cuối cùng
  const [courts, setCourts] = useState([]) // tất cả sân của cơ sở đó
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null) // 'lock' | 'create' | null
  const [reloadKey, setReloadKey] = useState(0)
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Đơn đã thanh toán của ngày đang xem (API có sẵn GET /api/chu-san/dat-san): confirmed (đã đặt) và completed (hoàn tất)
  // → vẽ thanh vàng từ giờ bắt đầu đến giờ kết thúc kèm tên khách. Đổi ngày thì tải lại.
  const [donTheoNgay, setDonTheoNgay] = useState([])
  const [khoaTheoNgay, setKhoaTheoNgay] = useState([]) // khung giờ khoá bảo trì của ngày đang xem (GET /api/chu-san/khoa-san)
  // Cơ sở đang xem: cơ sở chọn cuối cùng nếu còn tồn tại, không thì cơ sở đầu tiên
  // Cơ sở bị khoá không chọn được; mặc định lấy cơ sở chọn cuối (nếu không bị khoá) hoặc cơ sở dùng được đầu tiên
  const dungDuoc = (branches ?? []).filter((b) => !isBranchBlocked(b))
  const branch = dungDuoc.find((b) => String(b.maCoSo) === branchId) ?? dungDuoc[0] ?? null
  const maCoSoLich = branch?.maCoSo
  const chooseBranch = (id) => {
    setBranchId(id)
    saveLastBranch(id)
  }

  // Giờ trên lịch theo giờ mở cửa – đóng cửa của cơ sở
  const openMin = branch ? toMinutes(cut5(branch.gioMoCua)) : 0
  const closeMin = branch ? toMinutes(cut5(branch.gioDongCua)) : 0
  const gioList = branch && closeMin > openMin ? slotTimes(openMin, closeMin - SLOT_MIN) : []
  const gioCuoi = branch ? cut5(branch.gioDongCua) : ''

  useEffect(() => {
    if (!isOwner || !maCoSoLich) return
    let cancelled = false
    callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSoLich}&soDong=200`, { token })
      .then((data) => {
        if (!cancelled) {
          // Ô vàng: đơn đã xác nhận (confirmed/completed). Ô đỏ: đơn đã huỷ sau khi khách đã thanh toán
          setDonTheoNgay(
            data.cacDon.filter((d) => (d.trangThai === 'confirmed' || d.trangThai === 'completed') && !(d.nguon === 'owner' && d.trangThaiThu !== 'paid')),
          )
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    callApi(`/api/chu-san/khoa-san?tuNgay=${encodeURIComponent(`${date} 00:00`)}&denNgay=${encodeURIComponent(`${date} 23:59`)}`, { token })
      .then((data) => {
        if (!cancelled) setKhoaTheoNgay(data)
      })
      .catch(() => {
        if (!cancelled) setKhoaTheoNgay([])
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSoLich, date, tick, reloadKey])

  const tatCaDon = donTheoNgay.map((d) => ({
    maSan: d.maSan,
    maDon: d.maDatSan,
    tenKhach: d.tenKhach,
    gioBatDau: d.gioBatDau.slice(0, 5),
    gioKetThuc: d.gioKetThuc.slice(0, 5),
  }))
  const khoaBars = khoaTheoNgay.map((k) => ({
    maSan: k.maSan,
    maDon: `khoa-${k.maKhoa}`,
    khoa: true,
    lyDo: k.lyDo,
    tenKhach: 'Khoá bảo trì',
    gioBatDau: k.thoiGianBatDau.slice(11, 16),
    gioKetThuc: k.thoiGianKetThuc.slice(11, 16),
  }))
  // Lịch chỉ hiển thị đơn đang giữ sân (không vẽ đơn đã huỷ để khách khác đặt được khung giờ đó)
  const datSanTheoNgay = [...tatCaDon, ...khoaBars]

  // Sang ngày mới thì ô ngày tự đổi theo (chỉ khi đang xem đúng ngày hôm qua)
  useEffect(() => {
    let current = todayISO()
    const id = setInterval(() => {
      const now = todayISO()
      if (now !== current) {
        const old = current
        current = now
        setDate((prev) => (prev === old ? now : prev))
      }
    }, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!isOwner || branches === null) return
    if (!maCoSoLich) {
      setCourts([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const cacSan = await callApi(`/api/chu-san/san?maCoSo=${maCoSoLich}`, { token })
        if (cancelled) return
        setCourts(cacSan)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, branches, maCoSoLich, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const canOpenDialog = branch && courts.length > 0 && gioList.length > 0
  const afterChange = (msg) => {
    setReloadKey((n) => n + 1)
    if (msg) setNotice(msg)
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      {branches !== null && branches.length > 0 && dungDuoc.length === 0 && <Alert type="warning">Tất cả cơ sở của bạn đang bị khoá nên chưa xem được lịch hoạt động.</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput value={date} onChange={(v) => v && setDate(v)} ariaLabel="Chọn ngày" />
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branch ? String(branch.maCoSo) : ''} onChange={(e) => chooseBranch(e.target.value)}>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}
                {isBranchBlocked(b) ? ' (bị khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* Chú thích màu trạng thái */}
        <div className="legend" aria-label="Chú thích màu">
          <span className="legend-item">
            <i className="legend-box legend-free" /> Trống
          </span>
          <span className="legend-item">
            <i className="legend-box legend-booked" /> Đã đặt
          </span>
          <span className="legend-item">
            <i className="legend-box legend-locked" /> Khoá bảo trì
          </span>
        </div>
        <div className="calendar-actions">
          <button type="button" className="btn btn-primary" disabled={!canOpenDialog} onClick={() => { setNotice(''); setDialog('create') }}>
            Tạo đơn
          </button>
          <button type="button" className="btn btn-lock" disabled={!canOpenDialog} onClick={() => { setNotice(''); setDialog('lock') }}>
            Khoá khung giờ
          </button>
        </div>
      </div>

      <section className="card table-card">
        {/* Kéo thanh trượt ngang để xem các khung giờ; cột tên sân đứng yên */}
        <div className="table-scroll matrix-scroll">
          <table className="matrix matrix-wide" style={{ minWidth: 140 + (gioList.length + 1) * 47 }}>
            <thead>
              <tr>
                <th>Sân</th>
                {gioList.map((h) => (
                  <th key={h} className="time-head">
                    <span className="time-label">{h}</span>
                  </th>
                ))}
                {/* Cột cuối cho mốc giờ đóng cửa: dải màu nền chạy liên tục đến hết ô này */}
                <th className="time-head time-head-end">
                  <span className="time-label">{gioCuoi}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={gioList.length + 2} className="table-empty">
                    Đang tải danh sách sân...
                  </td>
                </tr>
              )}
              {!loading && courts.length === 0 && (
                <tr>
                  <td colSpan={gioList.length + 2} className="table-empty">
                    Cơ sở này chưa có sân nào.
                  </td>
                </tr>
              )}
              {courts.map((c) => (
                <tr key={c.maSan} className={c.trangThai === 'maintenance' ? 'court-closed' : undefined}>
                  <th scope="row">{c.tenSan}</th>
                  {buildCourtCells(
                    datSanTheoNgay.filter((d) => d.maSan === c.maSan),
                    gioList.length,
                    openMin,
                  ).map((cell) =>
                    cell.dat ? (
                      <td
                        key={cell.key}
                        colSpan={cell.span}
                        className={`slot-cell slot-booked${cell.dat.khoa ? ' slot-locked' : ''}`}
                        title={
                          cell.dat.khoa
                            ? `Khoá bảo trì: ${cell.dat.gioBatDau} – ${cell.dat.gioKetThuc}${cell.dat.lyDo ? ` (${cell.dat.lyDo})` : ''}`
                            : `${cell.dat.tenKhach} (${cell.dat.maDon}): ${cell.dat.gioBatDau} – ${cell.dat.gioKetThuc}`
                        }
                      >
                        <span className="slot-name">{cell.dat.tenKhach}</span>
                        <span className="slot-time">
                          {cell.dat.gioBatDau} – {cell.dat.gioKetThuc}
                        </span>
                      </td>
                    ) : (
                      <td key={cell.key} className="slot-cell" />
                    ),
                  )}
                  <td className="slot-end" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialog === 'lock' && canOpenDialog && (
        <LockCourtDialog
          token={token}
          courts={courts}
          branch={branch}
          defaultDate={date}
          onClose={() => setDialog(null)}
          onChanged={afterChange}
        />
      )}
      {dialog === 'create' && canOpenDialog && (
        <CreateOrderDialog
          token={token}
          courts={courts}
          branch={branch}
          defaultDate={date}
          onClose={() => setDialog(null)}
          onCreated={(msg) => {
            setDialog(null)
            afterChange(msg)
          }}
        />
      )}
    </Page>
  )
}

function QrCheckin({ bookings, setBookings }) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState({ type: 'idle', message: 'Chưa có mã vé được kiểm tra.' })

  const handleSubmit = (e) => {
    e.preventDefault()
    const value = code.trim().toUpperCase()

    if (!value) {
      setResult({ type: 'error', message: 'Vui lòng nhập mã đặt sân.' })
      return
    }

    const booking = bookings.find((b) => b.code === value)

    if (!booking) {
      setResult({ type: 'error', message: `Không tìm thấy mã ${value}. Kiểm tra lại mã trên vé và thử lại.` })
      return
    }
    if (booking.status === 'Đã hủy') {
      setResult({ type: 'error', message: `Mã ${booking.code} đã bị hủy, không thể check-in.` })
      return
    }
    if (booking.status === 'Hoàn tất' || booking.checkedIn) {
      setResult({
        type: 'warning',
        message: `Mã ${booking.code} đã check-in trước đó (${booking.court} · ${booking.time}).`,
      })
      return
    }

    setBookings((prev) => prev.map((b) => (b.code === value ? { ...b, checkedIn: true } : b)))
    setResult({
      type: 'success',
      message: `Check-in thành công: ${booking.customer} · ${booking.court} · ${booking.time}.`,
    })
    setCode('')
  }

  return (
    <Page title="QR check-in tại quầy" subtitle="Camera không khả dụng trong bản demo. Nhập mã vé để kiểm tra và check-in.">
      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="label" htmlFor="booking-code">
          Mã đặt sân
        </label>
        <input
          id="booking-code"
          className="input"
          type="text"
          placeholder="Ví dụ: BD26082101"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary btn-lg">
          Kiểm tra &amp; check-in
        </button>
      </form>

      <Alert type={result.type}>{result.message}</Alert>
    </Page>
  )
}

// Cột sắp xếp của bảng đặt sân (giờ thanh toán = lúc khách gửi ảnh chuyển khoản, ngayGuiAnh)
const BOOKING_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (d) => d.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (d) => d.soDienThoaiLienHe },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'ngayDat', label: 'Ngày đặt sân', type: 'date', get: (d) => d.ngayTao },
  { key: 'thoiGian', label: 'Thời gian chơi', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'thanhToan', label: 'Ngày giờ thanh toán', type: 'date', get: (d) => d.ngayGuiAnh },
  { key: 'ghiChu', label: 'Ghi chú', type: 'text', get: (d) => d.ghiChu },
  { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (d) => d.hienThi },
]
const BOOKING_BADGE = {
  'Chờ thanh toán': 'unpaid',
  'Đã chuyển khoản': 'paid',
  'Đã thanh toán': 'ok',
  'Đã sử dụng sân': 'ok',
  'Chờ hoàn tiền': 'wait',
  'Đã huỷ': 'no',
}

// Cửa sổ "Chuyển sân": đổi sân của khách sang sân khác CÙNG cơ sở, cùng ngày giờ (giá giữ nguyên, không hoàn / thu thêm).
// Chỉ dùng API có sẵn (backend không có API chuyển sân riêng, việc chuyển nằm trong API khoá sân):
//   GET  /api/chu-san/khoa-san/xem-truoc  → sân thay thế còn trống (cacSanThayThe) cho đúng khung giờ của đơn
//   POST /api/chu-san/khoa-san + xuLyDonVuong [{ maDatSan, hanhDong: 'chuyen-san', maSanMoi }] → chuyển đơn, khách nhận thông báo
//   DELETE /api/chu-san/khoa-san/:maKhoa  → API khoá sân luôn khoá lại khung giờ vừa trống ở sân cũ, nên web gỡ khoá đó ngay để sân cũ nhận khách khác.
function TransferCourtDialog({ token, order, onClose, onDone }) {
  const ngay = String(order.ngay).slice(0, 10)
  const bd = cut5(order.gioBatDau)
  const kt = cut5(order.gioKetThuc)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState([])
  const [maSanMoi, setMaSanMoi] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    callApi(`/api/chu-san/khoa-san/xem-truoc?maSan=${order.maSan}&tuNgay=${ngay}&denNgay=${ngay}&gioBatDau=${bd}&gioKetThuc=${kt}`, { token })
      .then((data) => {
        if (cancelled) return
        const mo = (data.cacDonVuong ?? []).find((x) => Number(x.maDatSan) === Number(order.maDatSan))
        const ds = mo?.cacSanThayThe ?? []
        setOptions(ds)
        setMaSanMoi(ds[0] ? String(ds[0].maSan) : '')
        if (!mo) setError('Không tìm thấy đơn trong khung giờ này.')
        else if (!ds.length) setError(mo.lyDoKhongXuLy || 'Không còn sân nào trống đúng khung giờ này để chuyển.')
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, order.maSan, order.maDatSan, ngay, bd, kt])

  const submit = async () => {
    if (!maSanMoi) return setError('Vui lòng chọn sân muốn chuyển tới.')
    setBusy(true)
    setError('')
    try {
      const kq = await callApi('/api/chu-san/khoa-san', {
        method: 'POST',
        token,
        body: {
          maSan: order.maSan,
          tuNgay: ngay,
          denNgay: ngay,
          gioBatDau: bd,
          gioKetThuc: kt,
          lyDo: 'Chuyển sân cho khách',
          xuLyDonVuong: [{ maDatSan: order.maDatSan, hanhDong: 'chuyen-san', maSanMoi: Number(maSanMoi) }],
        },
      })
      let conKhoa = false
      for (const k of kq.cacKhoa ?? []) {
        try {
          await callApi(`/api/chu-san/khoa-san/${k.maKhoa}`, { method: 'DELETE', token })
        } catch {
          conKhoa = true
        }
      }
      const tenMoi = options.find((o) => String(o.maSan) === maSanMoi)?.tenSan ?? ''
      onDone(`Đã chuyển đơn của ${order.tenKhach} sang ${tenMoi}.${conKhoa ? ' Khung giờ ở sân cũ đang bị khoá, hãy gỡ khoá ở Lịch hoạt động nếu muốn nhận khách khác.' : ''}`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Chuyển sân cho khách" width={480} onClose={() => !busy && onClose()}>
      <div className="refund-summary">
        <div>
          Khách: <strong>{order.tenKhach}</strong> · {order.soDienThoaiLienHe ?? '—'}
        </div>
        <div>
          Đơn: {order.tenSan} · {toViDate(ngay)} · {bd} – {kt}
        </div>
        <div>Giá và giờ chơi giữ nguyên, khách không phải trả thêm hay được hoàn tiền.</div>
      </div>
      <label className="dialog-field">
        <span>Chuyển tới sân</span>
        <select className="input" value={maSanMoi} onChange={(e) => setMaSanMoi(e.target.value)} disabled={loading || options.length === 0 || busy}>
          {loading && <option>Đang tìm sân trống...</option>}
          {!loading && options.length === 0 && <option>Không có sân trống</option>}
          {options.map((o) => (
            <option key={o.maSan} value={String(o.maSan)}>
              {o.tenSan}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy || loading || !maSanMoi}>
          {busy ? 'Đang chuyển...' : 'Chuyển sân'}
        </button>
      </div>
    </Dialog>
  )
}

// Quản lý đặt sân: khách đặt từ app → Chưa thanh toán → khách gửi ảnh chuyển khoản → Đã thanh toán (xem ảnh, Xác nhận / Huỷ đơn đặt)
// → Xác nhận: Đã xác nhận (lên Lịch hoạt động). API có sẵn:
//   GET /api/chu-san/dat-san, GET /api/chu-san/dat-san/:maDatSan (lý do),
//   POST /api/chu-san/dat-san/:maDatSan/xac-nhan-thanh-toan (Xác nhận), POST .../tu-choi-thanh-toan (Huỷ đơn đặt + lý do)
// Giờ hiện tại (ms), tự cập nhật theo chu kỳ để các nút phụ thuộc thời gian tự ẩn
const DIALOG_TABLE_CSS = `
.dialog.dialog-fit { display: flex; flex-direction: column; max-width: min(1240px, 96vw) !important; max-height: 94vh; overflow: hidden; }
.dialog-fit .dialog-head, .dialog-fit .picker-hint, .dialog-fit .dialog-error, .dialog-fit .dialog-two { flex: none; }
.dialog-fit .dialog-table-scroll { flex: 1 1 auto; min-height: 0; max-height: none; overflow: auto; border: 1px solid #dfe6e2; border-radius: 8px; }
.dialog-fit .dialog-table-scroll .table { table-layout: auto; width: 100%; min-width: 0; border-collapse: separate; border-spacing: 0; }
.dialog-fit .dialog-table-scroll .table-collect { min-width: 1000px; }
.dialog-fit .dialog-table-scroll .table-detail { min-width: 820px; }
.dialog-fit .dialog-table-scroll .table-revenue-detail { min-width: 760px; }
.dialog-fit .dialog-table-scroll .table th, .dialog-fit .dialog-table-scroll .table td { padding: 10px 14px; white-space: nowrap; }
.dialog-fit .dialog-table-scroll thead th { position: sticky; top: 0; z-index: 3; background: #eef3f0; box-shadow: 0 1px 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll thead th:first-child, .dialog-fit .dialog-table-scroll tbody td:first-child, .dialog-fit .dialog-table-scroll tfoot td:first-child { position: sticky; left: 0; background: #fff; box-shadow: 1px 0 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll tbody td:first-child { z-index: 2; }
.dialog-fit .dialog-table-scroll thead th:first-child { z-index: 4; background: #eef3f0; }
.dialog-fit .dialog-table-scroll tfoot td { position: sticky; bottom: 0; z-index: 2; background: #f4f7f5; box-shadow: 0 -1px 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll tfoot td:first-child { z-index: 4; }
.table-scroll .table th.num, .table-scroll .table td.num, .table-scroll .table-revenue-detail th.num, .table-scroll .table-revenue-detail td.num { text-align: right !important; font-variant-numeric: tabular-nums; }
.table th.num .th-sort { justify-content: flex-end; }
.table-revenue-detail tfoot td.num, .table-revenue-detail tbody td.num strong { font-weight: 700; }
`
function useDialogTableCss() {
  useEffect(() => {
    if (document.getElementById('dialog-table-css')) return
    const el = document.createElement('style')
    el.id = 'dialog-table-css'
    el.textContent = DIALOG_TABLE_CSS
    document.head.appendChild(el)
  }, [])
}

function useNow(ms) {
  const [now, setNow] = useState(() => nowMs())
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// Cửa sổ "Thu tiền": các đơn chủ sân đã tạo mà chưa thu tiền (vd khách đặt trước qua Zalo). Bấm "Thu tiền" → đơn thành "Đã thanh toán" và lên lịch.
// API có sẵn: GET /api/chu-san/dat-san (lọc đơn của chủ sân chưa thu phía web), PATCH /api/chu-san/dat-san/:maDatSan/da-thu
const COLLECT_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (d) => d.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (d) => d.soDienThoaiLienHe },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'ngay', label: 'Ngày', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'gio', label: 'Giờ', type: 'time', get: (d) => String(d.gioBatDau ?? '').slice(0, 5) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'tien', label: 'Tổng tiền', type: 'number', get: (d) => Number(d.tongTien) },
]
function CollectMoneyDialog({ token, onClose, onChanged }) {
  const [sortSel, setSortSel] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      ['confirmed', 'completed'].map((tt) => callApi(`/api/chu-san/dat-san?trangThai=${tt}&sapXep=cu-nhat&soDong=200`, { token })),
    )
      .then((kq) => {
        if (cancelled) return
        const dsach = kq
          .flatMap((r) => r.cacDon)
          .filter((d) => d.nguon === 'owner' && d.trangThaiThu !== 'paid')
          .sort((a, b) => `${String(a.ngay).slice(0, 10)} ${a.gioBatDau}`.localeCompare(`${String(b.ngay).slice(0, 10)} ${b.gioBatDau}`))
        setRows(dsach)
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, reload])

  const collect = async (d) => {
    setBusyId(d.maDatSan)
    setError('')
    try {
      // Backend yêu cầu body là một object (z.object({})) nên phải gửi {} chứ không được bỏ trống
      await callApi(`/api/chu-san/dat-san/${d.maDatSan}/da-thu`, { method: 'PATCH', token, body: {} })
      setReload((n) => n + 1)
      onChanged(`Đã thu tiền đơn của ${d.tenKhach}: đơn chuyển sang Đã thanh toán và hiện trên Lịch hoạt động.`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog title="Thu tiền" width={820} fit onClose={onClose}>
      <p className="picker-hint">Các đơn bạn đã tạo và đang chờ thu tiền. Bấm “Thu tiền” khi khách đã trả.</p>
      {error && <p className="dialog-error">{error}</p>}
      <div className="table-scroll dialog-table-scroll">
        <table className="table table-collect">
          <thead>
            <tr>
              <SortTh cols={COLLECT_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="gio" sel={sortSel} onSel={setSortSel}>Giờ</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="tien" sel={sortSel} onSel={setSortSel}>Tổng tiền</SortTh>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Đang tải...
                </td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Không có đơn nào đang chờ thu tiền.
                </td>
              </tr>
            )}
            {sortRows(rows ?? [], COLLECT_SORT_COLS, sortSel).map((d) => (
              <tr key={d.maDatSan}>
                <td>{d.tenKhach}</td>
                <td>{d.soDienThoaiLienHe ?? '—'}</td>
                <td>{d.tenSan}</td>
                <td>{toViDate(String(d.ngay).slice(0, 10))}</td>
                <td>
                  {cut5(d.gioBatDau)}–{cut5(d.gioKetThuc)}
                </td>
                <td>{d.tenCoSo}</td>
                <td>{formatVnd(d.tongTien)}</td>
                <td>
                  <button type="button" className="btn btn-sm btn-approve" disabled={busyId === d.maDatSan} onClick={() => collect(d)}>
                    Thu tiền
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}

function BookingsPage({ user, filters, onGoRefunds }) {
  const { date, setDate } = filters
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [allDays, setAllDays] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Mọi trạng thái')
  const [sortSel, setSortSel] = useState('') // sắp xếp bảng (xem sortRows); rỗng = mặc định
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState('') // đường dẫn ảnh chuyển khoản đang xem
  const [cancelTarget, setCancelTarget] = useState(null) // đơn đang mở cửa sổ huỷ
  const [noteView, setNoteView] = useState(null) // đơn đang mở cửa sổ xem ghi chú đầy đủ
  const [cancelReason, setCancelReason] = useState('')
  const [cancelType, setCancelType] = useState('problem') // 'problem' | 'other'
  const [transferTarget, setTransferTarget] = useState(null) // đơn đang mở cửa sổ Chuyển sân
  const [collectOpen, setCollectOpen] = useState(false) // cửa sổ Thu tiền
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const nowTick = useNow(30000) // mốc giờ hiện tại, cập nhật mỗi 30 giây
  const lastKey = useRef('')

  // Ngày tự đổi theo thời gian thực khi sang ngày mới (chỉ khi đang xem đúng ngày hôm qua)
  useEffect(() => {
    let current = todayISO()
    const id = setInterval(() => {
      const now = todayISO()
      if (now !== current) {
        const old = current
        current = now
        setDate((prev) => (prev === old ? now : prev))
      }
    }, 30000)
    return () => clearInterval(id)
  }, [setDate])

  const maCoSo = branchId // 'all' hoặc mã cơ sở
  const hasBranches = (branches?.length ?? 0) > 0
  useEffect(() => {
    if (branches !== null && branches.length === 0) setLoading(false)
  }, [branches])

  useEffect(() => {
    if (!isOwner || !hasBranches) return
    let cancelled = false
    // Tải lại theo chu kỳ / sau thao tác thì không hiện "Đang tải" (tránh nhấp nháy)
    const key = `${maCoSo}|${date}|${allDays}`
    const silent = lastKey.current === key
    lastKey.current = key
    if (!silent) setLoading(true)
    const loc = allDays ? '' : `&ngay=${date}`
    const locCoSo = maCoSo === 'all' ? '' : `&maCoSo=${maCoSo}`
    callApi(`/api/chu-san/dat-san?soDong=200${locCoSo}${loc}`, { token })
      .then((data) => {
        if (cancelled) return
        setOrders(data.cacDon)
        setTotal(data.tong)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, hasBranches, maCoSo, date, allDays, reload, tick])

  // Xác nhận: khách đã thanh toán → đơn thành Đã xác nhận, hiện ô vàng trên Lịch hoạt động
  const confirmOrder = async (d) => {
    setBusyId(d.maDatSan)
    setError('')
    try {
      await callApi(`/api/chu-san/dat-san/${d.maDatSan}/xac-nhan-thanh-toan`, { method: 'POST', token })
      setNotice(`Đã xác nhận đơn đặt sân của ${d.tenKhach}.`)
      setReload((n) => n + 1)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const openCancel = (d) => {
    setCancelTarget(d)
    setCancelReason('')
    setCancelType('problem')
    setError('')
  }

  // Huỷ đơn: chọn API theo loại đơn (xem huyDonTheoLoai)
  const submitCancel = async () => {
    const d = cancelTarget
    // Lý do 1: Sân đang có vấn đề (cố định). Lý do 2: Lý do khác — chủ sân tự nhập (bắt buộc)
    const lyDo = cancelType === 'problem' ? LY_DO_SAN_CO_VAN_DE : cancelReason.trim()
    if (!lyDo) {
      return setError('Vui lòng nhập lý do huỷ đơn (bắt buộc).')
    }
    setBusyId(d.maDatSan)
    setError('')
    try {
      const kq = await huyDonTheoLoai(token, d, lyDo)
      if (d.nguon === 'owner') {
        setNotice(`Đã huỷ đơn của ${d.tenKhach}.`)
      } else {
        setNotice(
          kq.daThanhToan
            ? `Đã huỷ đơn của ${d.tenKhach}. Khách được hoàn ${kq.tiLeHoan}% (${formatVnd(kq.soTienHoan)}) — đơn đang ở trạng thái Chờ hoàn tiền.`
            : `Đã huỷ đơn của ${d.tenKhach}.`,
        )
      }
      setCancelTarget(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const q = normalize(query.trim())
  const visibleBase = orders
    .map((d) => ({ ...d, hienThi: layTrangThaiDon(d) }))
    .filter((d) => {
      if (!d.hienThi) return false
      if (status !== 'Mọi trạng thái' && d.hienThi !== status) return false
      const sdt = String(d.soDienThoaiLienHe ?? '')
      if (q && !normalize(d.tenKhach ?? '').includes(q) && !normalize(d.tenSan ?? '').includes(q) && !sdt.includes(query.trim())) return false
      return true
    })
    .map((d) => ({ ...d, coSoKhoa: isBranchBlocked((branches ?? []).find((b) => b.maCoSo === d.maCoSo)) }))
    // Đơn còn hủy được của cơ sở bị khoá (chưa chuyển khoản / đã chuyển khoản) đứng đầu để chủ sân huỷ
    .sort((a, b) => {
      const ua = a.coSoKhoa && coTheHuyDon(a, nowTick) ? 0 : 1
      const ub = b.coSoKhoa && coTheHuyDon(b, nowTick) ? 0 : 1
      if (ua !== ub) return ua - ub
      return allDays ? 0 : a.gioBatDau.localeCompare(b.gioBatDau)
    })
  // Có chọn sắp xếp: đơn của cơ sở bị khoá cần huỷ vẫn đứng đầu, mỗi nhóm xếp theo cột đã chọn
  const canHuyNgay = (d) => d.coSoKhoa && coTheHuyDon(d, nowTick)
  const visible = sortSel
    ? [...sortRows(visibleBase.filter(canHuyNgay), BOOKING_SORT_COLS, sortSel), ...sortRows(visibleBase.filter((d) => !canHuyNgay(d)), BOOKING_SORT_COLS, sortSel)]
    : visibleBase
  const soDonCanHuy = visible.filter((d) => d.coSoKhoa && coTheHuyDon(d, nowTick)).length
  const colCount = 10

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      {soDonCanHuy > 0 && <Alert type="warning">Có {soDonCanHuy} đơn của cơ sở đang bị khoá cần huỷ (đang đứng đầu danh sách).</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput value={date} onChange={setDate} disabled={allDays} ariaLabel="Ngày" />
        </label>
        <label className="field-inline">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} />
          <span>Mọi ngày</span>
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setNotice(''); setCollectOpen(true) }}>
          Thu tiền
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Tìm tên khách, số điện thoại hoặc sân"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm tên khách, số điện thoại hoặc sân"
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option>Mọi trạng thái</option>
          {BOOKING_STATUSES.map((st) => (
            <option key={st}>{st}</option>
          ))}
        </select>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className={`table table-bookings table-bookings-fit`}>
            <thead>
              <tr>
                <SortTh cols={BOOKING_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="thoiGian" sel={sortSel} onSel={setSortSel}>Thời gian chơi</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="ngayDat" sel={sortSel} onSel={setSortSel}>Ngày đặt sân</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="thanhToan" sel={sortSel} onSel={setSortSel}>Ngày giờ thanh toán</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="ghiChu" sel={sortSel} onSel={setSortSel}>Ghi chú</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Đang tải danh sách đơn...
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Không có lịch đặt nào khớp bộ lọc.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((d) => (
                  <Fragment key={d.maDatSan}>
                    <tr>
                      <td>{d.tenKhach}</td>
                      <td>{d.soDienThoaiLienHe ?? '—'}</td>
                      <td>{d.tenSan}</td>
                      <td className="cell-play-time">
                        {d.gioBatDau.slice(0, 5)} – {d.gioKetThuc.slice(0, 5)}
                        {allDays && <div className="cell-sub">{toViDate(String(d.ngay).slice(0, 10))}</div>}
                      </td>
                      <td>{d.ngayTao ? toViDate(String(d.ngayTao).slice(0, 10)) : '—'}</td>
                      <td>
                        {d.tenCoSo ?? '—'}
                        {d.coSoKhoa && <span className="branch-locked-tag"> (cơ sở bị khoá)</span>}
                      </td>
                      <td>{d.ngayGuiAnh ? `${toViDate(String(d.ngayGuiAnh).slice(0, 10))} ${String(d.ngayGuiAnh).slice(11, 16)}` : '—'}</td>
                      <td className="cell-note" title={d.ghiChu ? String(d.ghiChu) : undefined}>
                        <div className="cell-note-text">{d.ghiChu ? String(d.ghiChu) : '—'}</div>
                        {d.ghiChu && (
                          <button type="button" className="cell-note-more" onClick={() => setNoteView(d)}>
                            Mở rộng
                          </button>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${BOOKING_BADGE[d.hienThi] ?? 'unpaid'}`}
                          title={d.hienThi === 'Đã huỷ' && (d.trangThai === 'pending_payment' || d.trangThai === 'expired') ? 'Qua giờ chơi mà chưa duyệt: hệ thống tự huỷ, khách được hoàn 100% (Admin xử lý)' : undefined}
                        >
                          {d.hienThi}
                        </span>
                      </td>
                      <td>
                        {/* Nút thao tác xếp 2x2: Xem ảnh – Xác nhận / Chuyển sân – Huỷ đơn; quá thời gian đơn thì không còn nút */}
                        {(() => {
                          const choXacNhan = d.trangThai === 'pending_payment'
                          const duocHuy = coTheHuyDon(d, nowTick)
                          const duocChuyen = coTheChuyenSan(d, nowTick)
                          if (d.hienThi === 'Chờ hoàn tiền') {
                            return (
                              <div className="row-actions row-actions-grid">
                                <button type="button" className="btn btn-sm btn-approve row-actions-span" onClick={() => onGoRefunds?.()}>
                                  Đến trang Hoàn tiền
                                </button>
                              </div>
                            )
                          }
                          if (!choXacNhan && !duocHuy && !duocChuyen) return null
                          const hienHuy = choXacNhan || duocHuy // đơn chờ xác nhận luôn có nút Huỷ đơn (huỷ trước hay sau Xác nhận đều được)
                          return (
                            <div className="row-actions row-actions-grid">
                              {choXacNhan && d.anhChuyenKhoanUrl && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(fileUrl(d.anhChuyenKhoanUrl))}>
                                  Xem ảnh
                                </button>
                              )}
                              {choXacNhan && (
                                <button type="button" className="btn btn-sm btn-approve" disabled={busyId === d.maDatSan} onClick={() => confirmOrder(d)}>
                                  Xác nhận
                                </button>
                              )}
                              {duocChuyen && (
                                <button type="button" className="btn btn-sm btn-transfer" disabled={busyId === d.maDatSan} onClick={() => { setNotice(''); setError(''); setTransferTarget(d) }}>
                                  Chuyển sân
                                </button>
                              )}
                              {hienHuy && (
                                <button type="button" className="btn btn-sm btn-reject" disabled={busyId === d.maDatSan} onClick={() => openCancel(d)}>
                                  Huỷ đơn
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>

                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
        {!loading && total > orders.length && (
          <p className="hint">
            Đang hiển thị {orders.length}/{total} đơn mới nhất. Hãy chọn ngày cụ thể để xem đủ.
          </p>
        )}
      </section>

      {collectOpen && (
        <CollectMoneyDialog
          token={token}
          onClose={() => setCollectOpen(false)}
          onChanged={(msg) => {
            setNotice(msg)
            setReload((n) => n + 1)
          }}
        />
      )}

      {/* Xem ảnh chuyển khoản khách gửi */}
      {preview && (
        <div className="modal-backdrop">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Ảnh chuyển khoản của khách" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreview('')}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Cửa sổ Chuyển sân cho khách */}
      {transferTarget && (
        <TransferCourtDialog
          token={token}
          order={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={(msg) => {
            setTransferTarget(null)
            setNotice(msg)
            setReload((n) => n + 1)
          }}
        />
      )}

      {/* Cửa sổ xem đầy đủ ghi chú của khách */}
      {noteView && (
        <Dialog title="Ghi chú của khách" width={520} onClose={() => setNoteView(null)}>
          <p className="picker-hint">
            {noteView.tenKhach} · {noteView.tenSan} · {toViDate(String(noteView.ngay).slice(0, 10))} {noteView.gioBatDau.slice(0, 5)} – {noteView.gioKetThuc.slice(0, 5)}
          </p>
          <div className="note-full">{String(noteView.ghiChu)}</div>
          <div className="dialog-two">
            <button type="button" className="dialog-primary" onClick={() => setNoteView(null)}>
              Đóng
            </button>
          </div>
        </Dialog>
      )}

      {/* Cửa sổ nhập lý do huỷ đơn */}
      {cancelTarget && (
        <Dialog title="Huỷ đơn" width={460} onClose={() => setCancelTarget(null)}>
          <p className="picker-hint">
            {cancelTarget.tenKhach} · {cancelTarget.tenSan} · {cancelTarget.gioBatDau.slice(0, 5)} – {cancelTarget.gioKetThuc.slice(0, 5)}
          </p>
          <div className="cancel-reasons" role="radiogroup" aria-label="Lý do huỷ đơn">
            <label className={`cancel-reason${cancelType === 'problem' ? ' is-selected' : ''}`}>
              <input type="radio" name="cancel-reason" checked={cancelType === 'problem'} onChange={() => setCancelType('problem')} />
              <span>
                <strong>{LY_DO_SAN_CO_VAN_DE}</strong>
                <small>Đơn được gửi sang trang Hoàn tiền với lý do này, mức hoàn mặc định 100%.</small>
              </span>
            </label>
            <label className={`cancel-reason${cancelType === 'other' ? ' is-selected' : ''}`}>
              <input type="radio" name="cancel-reason" checked={cancelType === 'other'} onChange={() => setCancelType('other')} />
              <span>
                <strong>Lý do khác</strong>
                <small>Chủ sân nhập lý do bên dưới; đơn được gửi sang trang Hoàn tiền kèm lý do này.</small>
              </span>
            </label>
          </div>
          <label className={`dialog-field cancel-other${cancelType === 'other' ? ' is-active' : ''}`}>
            <span>Lý do huỷ đơn</span>
            <input
              className="input"
              type="text"
              placeholder={cancelType === 'other' ? 'Nhập lý do huỷ đơn (bắt buộc)' : 'Chọn “Lý do khác” để nhập lý do'}
              value={cancelReason}
              maxLength={255}
              disabled={cancelType !== 'other'}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus={cancelType === 'other'}
            />
          </label>
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setCancelTarget(null)}>
              Đóng
            </button>
            <button
              type="button"
              className="dialog-danger"
              disabled={busyId === cancelTarget.maDatSan || (cancelType === 'other' && !cancelReason.trim())}
              onClick={submitCancel}
            >
              Huỷ đơn
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}

// Hoàn tiền: khách huỷ đơn đã thanh toán → chủ sân chuyển khoản hoàn rồi bấm "Đã hoàn tiền"
// API có sẵn: GET /api/chu-san/hoan-tien?trangThai=processing|refunded, POST /api/chu-san/hoan-tien/:maThanhToan/hoan-thanh
function RefundsPage({ user, onNavigate }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [tab, setTab] = useState('processing')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const lastTab = useRef('')

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    if (lastTab.current !== tab) setLoading(true)
    lastTab.current = tab
    callApi(`/api/chu-san/hoan-tien?trangThai=${tab}`, { token })
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tab, reload, tick])

  const [confirming, setConfirming] = useState(null) // yêu cầu đang mở hộp xác nhận hoàn tiền
  const [anhFile, setAnhFile] = useState(null) // ảnh chứng từ chuyển khoản hoàn
  const [anhXem, setAnhXem] = useState('') // đường dẫn xem trước ảnh vừa chọn
  const [daChuyen, setDaChuyen] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const openConfirm = (r) => {
    setConfirming(r)
    setAnhFile(null)
    setAnhXem('')
    setDaChuyen(false)
    setDialogError('')
  }

  const chonAnh = (e) => {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (anhXem) URL.revokeObjectURL(anhXem)
    setAnhFile(f)
    setAnhXem(f ? URL.createObjectURL(f) : '')
    setDialogError('')
  }

  // Chủ sân chuyển khoản cho khách trước, rồi tải ảnh chứng từ chuyển khoản và xác nhận.
  // API có sẵn: POST /api/chu-san/hoan-tien/:maThanhToan/hoan-thanh (multipart, trường anhChungTu bắt buộc) — khách nhận thông báo kèm ảnh.
  const complete = async (e) => {
    e.preventDefault()
    const r = confirming
    if (!anhFile) {
      setDialogError('Vui lòng thêm ảnh chứng từ chuyển khoản hoàn tiền để khách đối chiếu.')
      return
    }
    if (!/^image\/(jpeg|png|webp)$/.test(anhFile.type)) {
      setDialogError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
      return
    }
    if (!daChuyen) {
      setDialogError('Vui lòng tích xác nhận bạn đã chuyển khoản đúng số tiền cho khách.')
      return
    }
    setBusyId(r.maThanhToan)
    setDialogError('')
    setError('')
    try {
      const body = new FormData()
      body.append('anhChungTu', anhFile)
      await postMultipart(token, `/api/chu-san/hoan-tien/${r.maThanhToan}/hoan-thanh`, body)
      setNotice(`Đã ghi nhận hoàn tiền cho ${r.tenKhach}. Khách sẽ nhận thông báo kèm ảnh chứng từ.`)
      if (anhXem) URL.revokeObjectURL(anhXem)
      setConfirming(null)
      setReload((n) => n + 1)
    } catch (err) {
      setDialogError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  // Mức hoàn theo chính sách: huỷ trước ≥24h hoàn 100%, 12–24h hoàn 50% (huỷ < 12h không có yêu cầu hoàn tiền)
  const refundLevel = (r) => {
    const daTra = Number(r.soTienDaTra)
    const hoan = Number(r.soTienHoan ?? r.soTienDaTra)
    const pct = daTra > 0 ? Math.round((hoan / daTra) * 100) : 100
    let hours = null
    if (r.ngayHuy && r.ngay && r.gioBatDau) {
      const play = new Date(`${String(r.ngay).slice(0, 10)}T${String(r.gioBatDau).slice(0, 8)}`)
      const gap = (play - new Date(r.ngayHuy)) / 3600000
      if (Number.isFinite(gap)) hours = Math.max(0, Math.floor(gap))
    }
    return { pct, hours }
  }
  // Trạng thái hiển thị (dùng dữ liệu API có sẵn GET /api/chu-san/hoan-tien): quaHan = HanHoan < NOW(); escalated = backend đã báo Admin
  const refundStatus = (r) => {
    if (tab === 'refunded' || r.trangThaiHoanTien === 'refunded' || r.trangThaiHoanTien === 'received') return 'Đã hoàn tiền'
    return r.quaHan || r.trangThaiHoanTien === 'escalated' ? 'Quá hạn hoàn tiền' : 'Chờ hoàn tiền'
  }
  const REFUND_BADGE = { 'Chờ hoàn tiền': 'wait', 'Quá hạn hoàn tiền': 'no', 'Đã hoàn tiền': 'ok' }
  const refundCols = [
    { key: 'khach', label: 'Khách', type: 'text', get: (r) => r.tenKhach },
    { key: 'don', label: 'Đơn đặt', type: 'date', get: (r) => ngayGioKey(r.ngay, r.gioBatDau) },
    { key: 'muc', label: 'Mức hoàn', type: 'number', get: (r) => refundLevel(r).pct },
    { key: 'tien', label: 'Số tiền hoàn', type: 'number', get: (r) => Number(r.soTienHoan ?? r.soTienDaTra) },
    { key: 'nganHang', label: 'Tài khoản nhận hoàn tiền', type: 'text', get: (r) => r.tenNganHang },
    { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (r) => refundStatus(r) },
    { key: 'ngayHoan', label: 'Ngày hoàn', type: 'date', get: (r) => r.ngayHoan ?? r.ngayHuy },
  ]

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="tab-strip" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'processing'} className={`tab-strip-btn${tab === 'processing' ? ' active' : ''}`} onClick={() => setTab('processing')}>
          <NavIcon id="refunds" size={16} /> Chờ hoàn tiền
        </button>
        <button type="button" role="tab" aria-selected={tab === 'refunded'} className={`tab-strip-btn${tab === 'refunded' ? ' active' : ''}`} onClick={() => setTab('refunded')}>
          Đã hoàn tiền
        </button>
      </div>

      {tab === 'processing' && (
        <p className="hint refund-policy">
          Quy định hoàn tiền: khách huỷ sân trước giờ chơi <strong>từ 24 giờ trở lên</strong> được hoàn <strong>100%</strong>; <strong>từ 12 đến dưới 24 giờ</strong> hoàn <strong>50%</strong>; dưới 12 giờ không hoàn tiền.
          Hãy chuyển khoản cho khách trước, sau đó bấm “Hoàn tiền” và thêm ảnh chứng từ chuyển khoản để khách đối chiếu.
        </p>
      )}

      <section className="card table-card tab-attached">
        <div className="table-scroll">
          <table className="table table-refunds">
            <thead>
              <tr>
                <SortTh cols={refundCols} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={refundCols} k="don" sel={sortSel} onSel={setSortSel}>Đơn đặt</SortTh>
                <SortTh cols={refundCols} k="muc" sel={sortSel} onSel={setSortSel}>Mức hoàn</SortTh>
                <SortTh cols={refundCols} k="tien" sel={sortSel} onSel={setSortSel}>Số tiền hoàn</SortTh>
                <SortTh cols={refundCols} k="nganHang" sel={sortSel} onSel={setSortSel}>Tài khoản nhận hoàn tiền</SortTh>
                <SortTh cols={refundCols} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                {tab === 'processing' ? <th>Thao tác</th> : <SortTh cols={refundCols} k="ngayHoan" sel={sortSel} onSel={setSortSel}>Ngày hoàn · ảnh chứng từ</SortTh>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    {tab === 'processing' ? 'Không có yêu cầu hoàn tiền nào đang chờ.' : 'Chưa có khoản hoàn tiền nào.'}
                  </td>
                </tr>
              )}
              {!loading &&
                sortRows(rows, refundCols, sortSel).map((r) => (
                  <tr key={r.maThanhToan}>
                    <td>
                      {r.tenKhach}
                      <div className="cell-sub">{r.soDienThoai}</div>
                    </td>
                    <td>
                      {r.tenSan} · {toViDate(String(r.ngay).slice(0, 10))}
                      <div className="cell-sub">
                        {r.gioBatDau.slice(0, 5)} – {r.gioKetThuc.slice(0, 5)}
                      </div>
                    </td>
                    <td>
                      <span className={`refund-pct${refundLevel(r).pct >= 100 ? ' is-full' : ''}`}>Hoàn {refundLevel(r).pct}%</span>
                      {refundLevel(r).hours !== null && <div className="cell-sub">Huỷ trước giờ chơi {refundLevel(r).hours} giờ</div>}
                    </td>
                    <td>{formatVnd(Number(r.soTienHoan ?? r.soTienDaTra))}</td>
                    <td>
                      {r.tenNganHang ? (
                        <>
                          {r.tenNganHang} · {r.soTaiKhoan}
                          <div className="cell-sub">{r.chuTaiKhoan}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`status-badge status-${REFUND_BADGE[refundStatus(r)]}`}>{refundStatus(r)}</span>
                      {tab === 'processing' && r.hanHoan && (
                        <div className="cell-sub">Hạn hoàn: {toViDate(String(r.hanHoan).slice(0, 10))} {String(r.hanHoan).slice(11, 16)}</div>
                      )}
                    </td>
                    <td>
                      {tab === 'processing' ? (
                        <button type="button" className="btn btn-sm btn-approve" disabled={busyId === r.maThanhToan} onClick={() => openConfirm(r)}>
                          Hoàn tiền
                        </button>
                      ) : (
                        <>
                          {r.ngayHoan ? toViDate(String(r.ngayHoan).slice(0, 10)) : '—'}
                          {r.anhChungTuUrl && (
                            <a href={fileUrl(r.anhChungTuUrl)} target="_blank" rel="noreferrer" className="refund-proof-link" title="Mở ảnh chứng từ">
                              <img className="refund-proof-thumb" src={fileUrl(r.anhChungTuUrl)} alt="Ảnh chứng từ hoàn tiền" />
                            </a>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirming && (
        <Dialog title="Xác nhận hoàn tiền cho khách" onClose={() => busyId === null && setConfirming(null)} width={520}>
          <form onSubmit={complete} noValidate>
            <div className="refund-summary">
              <div>
                Khách: <strong>{confirming.tenKhach}</strong> · {confirming.soDienThoai}
              </div>
              <div>
                Đơn: {confirming.tenSan} · {toViDate(String(confirming.ngay).slice(0, 10))} · {confirming.gioBatDau.slice(0, 5)} – {confirming.gioKetThuc.slice(0, 5)}
              </div>
              <div>
                Mức hoàn: <strong>{refundLevel(confirming).pct}%</strong>
                {refundLevel(confirming).hours !== null && ` (khách huỷ trước giờ chơi ${refundLevel(confirming).hours} giờ)`}
              </div>
              <div className="refund-amount">Số tiền cần chuyển: {formatVnd(Number(confirming.soTienHoan ?? confirming.soTienDaTra))}</div>
              <div>
                Chuyển tới:{' '}
                {confirming.tenNganHang ? (
                  <strong>
                    {confirming.tenNganHang} · {confirming.soTaiKhoan} · {confirming.chuTaiKhoan}
                  </strong>
                ) : (
                  'Khách chưa cung cấp tài khoản nhận tiền'
                )}
              </div>
            </div>
            <label className="dialog-field">
              <span>Ảnh chứng từ chuyển khoản hoàn tiền *</span>
              <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chonAnh} />
            </label>
            {anhXem && <img className="refund-proof-preview" src={anhXem} alt="Ảnh chứng từ đã chọn" />}
            <label className="refund-check">
              <input type="checkbox" checked={daChuyen} onChange={(e) => setDaChuyen(e.target.checked)} />
              <span>Tôi đã chuyển khoản đúng số tiền cho khách. Khách sẽ nhận thông báo kèm ảnh chứng từ này.</span>
            </label>
            {dialogError && <p className="dialog-error">{dialogError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setConfirming(null)} disabled={busyId !== null}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={busyId !== null}>
                {busyId !== null ? 'Đang gửi...' : 'Xác nhận đã chuyển tiền'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Page>
  )
}

/* ============================================================
   Chuông thông báo (góc phải trên cùng của mọi trang)
   API có sẵn: GET /api/thong-bao?trang=1&soLuong=20 (trả cacThongBao + soChuaDoc),
   PATCH /api/thong-bao/:maThongBao/da-doc, POST /api/thong-bao/da-doc-tat-ca
   ============================================================ */
function NotificationBell({ user }) {
  const token = user.maTruyCap
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const tick = useAutoRefresh(30000) // kiểm tra thông báo mới mỗi 30 giây
  const box = useRef(null)

  useEffect(() => {
    let cancelled = false
    callApi('/api/thong-bao?trang=1&soLuong=20', { token })
      .then((data) => {
        if (cancelled) return
        setItems(data.cacThongBao ?? [])
        setUnread(Number(data.soChuaDoc ?? 0))
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, tick, reload])

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const markRead = async (n) => {
    if (n.daDoc) return
    try {
      await callApi(`/api/thong-bao/${n.maThongBao}/da-doc`, { method: 'PATCH', token })
      setReload((x) => x + 1)
    } catch (err) {
      setError(err.message)
    }
  }
  const markAll = async () => {
    try {
      await callApi('/api/thong-bao/da-doc-tat-ca', { method: 'POST', token })
      setReload((x) => x + 1)
    } catch (err) {
      setError(err.message)
    }
  }
  const fmt = (v) => (v ? `${toViDate(String(v).slice(0, 10))} ${String(v).slice(11, 16)}` : '—')

  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Thông báo" aria-expanded={open} title="Thông báo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Danh sách thông báo">
          <div className="bell-head">
            <strong>Thông báo</strong>
            {unread > 0 && (
              <button type="button" className="bell-readall" onClick={markAll}>
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          {error && <p className="dialog-error">{error}</p>}
          <div className="bell-list">
            {items.length === 0 && !error && <p className="bell-empty">Chưa có thông báo nào.</p>}
            {items.map((n) => (
              <button type="button" key={n.maThongBao} className={`bell-item${n.daDoc ? '' : ' is-unread'}`} onClick={() => markRead(n)}>
                <span className="bell-title">{n.tieuDe}</span>
                <span className="bell-text">{n.noiDung}</span>
                <span className="bell-time">{fmt(n.ngayTao)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PageBanner({ title, icon, right }) {
  return (
    <div className="page-banner">
      <h1 className="page-banner-title">
        {icon && (
          <span className="page-banner-icon">
            <NavIcon id={icon} size={28} />
          </span>
        )}
        {title}
      </h1>
      {right}
    </div>
  )
}

/* ============================================================
   Quản lý cơ sở
   API có sẵn: GET /api/chu-san/co-so (danh sách), POST /api/chu-san/co-so (thêm cơ sở),
   POST /api/chu-san/co-so/:maCoSo/anh (ảnh bìa, multipart trường tepAnh)
   ============================================================ */

const BRANCH_STATUS = {
  hidden: { label: 'Chưa hiển thị cho khách', className: 'status-wait', hint: 'Cần có ít nhất 1 sân hoạt động và bảng giá thì cơ sở mới hiện cho khách đặt.' },
  active: { label: 'Đang hoạt động', className: 'status-ok', hint: '' },
  closed: { label: 'Đã khoá', className: 'status-maint', hint: 'Cơ sở đã bị khoá: khách không đặt được và các sân, bảng giá, lịch của cơ sở này không dùng được. Bấm "Mở khoá" để hoạt động lại.' },
  locked: { label: 'Bị khoá', className: 'status-maint', hint: 'Cơ sở bị quản trị viên khoá, vui lòng liên hệ quản trị viên.' },
}
const MIN_BOOKING_OPTIONS = [60, 90, 120]
const EMPTY_BRANCH_FORM = {
  tenCoSo: '',
  diaChi: '',
  tinhThanh: '',
  quanHuyen: '',
  soDienThoai: '',
  zalo: '',
  linkBanDo: '', // link Google Maps do chủ sân dán
  moTa: '',
  gioMoCua: '06:00',
  gioDongCua: '22:00',
  soPhutDatToiThieu: '60',
}
// Số liên hệ giống backend: di động 10 số (03/05/07/08/09) hoặc số bàn 11 số, bắt đầu bằng 0 (chấp nhận +84 / khoảng trắng)
const CONTACT_PHONE_RE = /^0([35789]\d{8}|2\d{9})$/
function normalizeContactPhone(raw) {
  let digits = String(raw ?? '').replace(/[^0-9]/g, '')
  if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2)
  if (digits && !digits.startsWith('0')) digits = `0${digits}`
  return digits
}

// Trả về { body } hợp lệ gửi API hoặc { error } (luật khớp validator của backend)
function validateBranchForm(f) {
  const text = (v) => String(v ?? '').trim()
  const tenCoSo = text(f.tenCoSo)
  const diaChi = text(f.diaChi)
  const tinhThanh = text(f.tinhThanh)
  const quanHuyen = text(f.quanHuyen)
  const zalo = text(f.zalo)
  const moTa = String(f.moTa ?? '').trim()
  if (!tenCoSo || !diaChi || !tinhThanh || !quanHuyen || !text(f.soDienThoai) || !text(f.linkBanDo)) {
    return { error: 'Vui lòng nhập đầy đủ các mục có dấu *.' }
  }
  if (tenCoSo.length < 2 || tenCoSo.length > 150) return { error: 'Tên cơ sở từ 2 đến 150 ký tự.' }
  if (diaChi.length < 5 || diaChi.length > 255) return { error: 'Địa chỉ từ 5 đến 255 ký tự.' }
  if (tinhThanh.length < 2 || tinhThanh.length > 80) return { error: 'Tỉnh/Thành từ 2 đến 80 ký tự.' }
  if (quanHuyen.length < 2 || quanHuyen.length > 80) return { error: 'Quận/Huyện từ 2 đến 80 ký tự.' }
  const soDienThoai = normalizeContactPhone(f.soDienThoai)
  if (!CONTACT_PHONE_RE.test(soDienThoai)) {
    return { error: 'Số điện thoại không hợp lệ (di động 10 số hoặc số bàn 11 số, bắt đầu bằng 0).' }
  }
  if (zalo.length > 30) return { error: 'Zalo tối đa 30 ký tự.' }
  const loiLink = checkMapLink(f.linkBanDo)
  if (loiLink) return { error: loiLink }
  if (moTa.length > 2000) return { error: 'Mô tả tối đa 2000 ký tự.' }
  if (!f.gioMoCua || !f.gioDongCua) return { error: 'Vui lòng chọn giờ mở cửa và giờ đóng cửa.' }
  if (f.gioMoCua >= f.gioDongCua) return { error: 'Giờ đóng cửa phải sau giờ mở cửa.' }
  const soPhut = Number(f.soPhutDatToiThieu)
  if (!Number.isInteger(soPhut) || soPhut < 30 || soPhut % 30 !== 0) return { error: 'Thời gian đặt tối thiểu phải là bội số của 30 phút.' }

  const linkBanDo = String(f.linkBanDo).trim()
  const body = { tenCoSo, diaChi, tinhThanh, quanHuyen, soDienThoai, linkBanDo, gioMoCua: f.gioMoCua, gioDongCua: f.gioDongCua, soPhutDatToiThieu: soPhut }
  if (zalo) body.zalo = zalo
  if (moTa) body.moTa = moTa
  return { body }
}

// Lỗi của từng ô BẮT BUỘC trong cửa sổ Thêm / Sửa cơ sở (ô tuỳ chọn: Zalo, Mô tả, Ảnh không kiểm tra). Dùng để nhắc ngay khi chủ sân rời khỏi ô.
function branchFieldErrors(f) {
  const text = (v) => String(v ?? '').trim()
  const e = {}
  const ten = text(f.tenCoSo)
  if (!ten) e.tenCoSo = 'Vui lòng nhập tên cơ sở.'
  else if (ten.length < 2) e.tenCoSo = 'Tên cơ sở từ 2 đến 150 ký tự.'
  const dc = text(f.diaChi)
  if (!dc) e.diaChi = 'Vui lòng nhập địa chỉ.'
  else if (dc.length < 5) e.diaChi = 'Địa chỉ từ 5 đến 255 ký tự.'
  if (!text(f.tinhThanh)) e.tinhThanh = 'Vui lòng chọn Tỉnh/Thành.'
  if (!text(f.quanHuyen)) e.quanHuyen = 'Vui lòng chọn Quận/Huyện.'
  if (!text(f.soDienThoai)) e.soDienThoai = 'Vui lòng nhập số điện thoại.'
  else if (!CONTACT_PHONE_RE.test(normalizeContactPhone(f.soDienThoai))) e.soDienThoai = 'Số điện thoại không hợp lệ (di động 10 số hoặc số bàn 11 số, bắt đầu bằng 0).'
  const loiLink = checkMapLink(f.linkBanDo)
  if (loiLink) e.linkBanDo = loiLink
  if (!f.gioMoCua) e.gioMoCua = 'Vui lòng chọn giờ mở cửa.'
  if (!f.gioDongCua) e.gioDongCua = 'Vui lòng chọn giờ đóng cửa.'
  else if (f.gioMoCua && f.gioMoCua >= f.gioDongCua) e.gioDongCua = 'Giờ đóng cửa phải sau giờ mở cửa.'
  return e
}

function BranchCard({ b, busy, onEdit, onToggleLock, onDelete }) {
  const st = BRANCH_STATUS[b.trangThai] ?? { label: b.trangThai, className: 'status-wait', hint: '' }
  const place = [b.quanHuyen, b.tinhThanh].filter(Boolean).join(', ')
  return (
    <article className="branch-slide">
      <div className="branch-slide-photo">
        {b.duongDanAnh ? <img src={fileUrl(b.duongDanAnh)} alt={b.tenCoSo} /> : <span>Cơ sở chưa có ảnh</span>}
      </div>
      <div className="branch-slide-body">
        <div className="branch-slide-head">
          <h3>{b.tenCoSo}</h3>
          <span className={`status-badge ${st.className}`}>{st.label}</span>
        </div>
        {/* Sửa cơ sở (gồm cả đổi ảnh, giờ hoạt động) – Khoá / Mở khoá cơ sở – Xoá cơ sở */}
        <div className="branch-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(b)} disabled={busy || b.trangThai === 'locked'}>
            Sửa cơ sở
          </button>
          {b.trangThai === 'closed' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggleLock(b)} disabled={busy}>
              Mở khoá cơ sở
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onToggleLock(b)}
              disabled={busy || b.trangThai === 'locked' || Number(b.soSanHoatDong ?? 0) > 0}
              title={b.trangThai === 'locked' ? 'Cơ sở do quản trị viên khoá' : Number(b.soSanHoatDong ?? 0) > 0 ? 'Cần khoá tất cả sân của cơ sở trước (sân không còn đơn đặt)' : undefined}
            >
              Khoá cơ sở
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger-text"
            onClick={() => onDelete(b)}
            disabled={busy || b.trangThai !== 'closed'}
            title={b.trangThai === 'closed' ? 'Xoá cơ sở khỏi hệ thống' : 'Cần khoá cơ sở trước khi xoá'}
          >
            Xoá cơ sở
          </button>
        </div>
        <dl className="branch-info">
          <div>
            <dt>Địa chỉ</dt>
            <dd>
              {b.diaChi}
              {place ? `, ${place}` : ''}
              {b.linkBanDo && (
                <>
                  {' '}
                  <a href={b.linkBanDo} target="_blank" rel="noreferrer">
                    Xem bản đồ
                  </a>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Liên hệ</dt>
            <dd>
              {b.soDienThoai ?? '—'}
              {b.zalo ? ` · Zalo: ${b.zalo}` : ''}
            </dd>
          </div>
          <div>
            <dt>Giờ hoạt động</dt>
            <dd>
              {cut5(b.gioMoCua)} – {cut5(b.gioDongCua)} · đặt tối thiểu {b.soPhutDatToiThieu} phút
            </dd>
          </div>
          <div>
            <dt>Số sân</dt>
            <dd>
              {b.soSanHoatDong ?? 0} đang hoạt động / {b.soSan ?? 0} sân
            </dd>
          </div>
          <div>
            <dt>Giá thấp nhất</dt>
            <dd>{b.giaThapNhat != null ? `${formatVnd(Number(b.giaThapNhat))}/giờ` : 'Chưa có bảng giá'}</dd>
          </div>
          {b.moTa && (
            <div>
              <dt>Mô tả</dt>
              <dd>{b.moTa}</dd>
            </div>
          )}
        </dl>
        {st.hint && <p className="branch-hint">{st.hint}</p>}
      </div>
    </article>
  )
}

function BranchesPage({ user, onCreated }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null) // cơ sở đang thao tác
  const [editing, setEditing] = useState(null) // cơ sở đang sửa (null = đang thêm mới)
  const [confirm, setConfirm] = useState(null) // { type: 'lock' | 'unlock' | 'delete', b, lyDo, busy, error }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_BRANCH_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [touched, setTouched] = useState({}) // ô đã nhập xong (rời khỏi ô) → bắt đầu hiện lỗi của ô đó
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const listRef = useRef(null)
  const tick = useAutoRefresh()

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (!cancelled) setBranches(Array.isArray(data) ? data : data ? [data] : [])
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  // Khoá / mở khoá / xoá cơ sở: PATCH .../co-so/:maCoSo/dong, PATCH .../co-so/:maCoSo/mo, DELETE .../co-so/:maCoSo
  const runConfirm = async () => {
    const { type, b, lyDo } = confirm
    setConfirm((c) => ({ ...c, busy: true, error: '' }))
    try {
      if (type === 'delete') {
        await callApi(`/api/chu-san/co-so/${b.maCoSo}`, { method: 'DELETE', token, body: lyDo.trim() ? { lyDo: lyDo.trim() } : {} })
        setBranches((prev) => prev.filter((x) => x.maCoSo !== b.maCoSo))
        setSuccess(`Đã xoá cơ sở ${b.tenCoSo}.`)
      } else {
        const kq = await callApi(`/api/chu-san/co-so/${b.maCoSo}/${type === 'lock' ? 'dong' : 'mo'}`, {
          method: 'PATCH',
          token,
          body: type === 'lock' && lyDo.trim() ? { lyDo: lyDo.trim() } : {},
        })
        setBranches((prev) => prev.map((x) => (x.maCoSo === b.maCoSo ? { ...x, trangThai: kq.trangThai } : x)))
        setSuccess(type === 'lock' ? `Đã khoá cơ sở ${b.tenCoSo}.` : `Đã mở khoá cơ sở ${b.tenCoSo}.`)
      }
      setConfirm(null)
      onCreated?.()
    } catch (err) {
      const hint = err.status === 409 && type !== 'unlock' ? ' Hãy huỷ các đơn còn lại và khoá tất cả sân của cơ sở trước.' : ''
      setConfirm((c) => ({ ...c, busy: false, error: `${describeApiError(err)}${hint}` }))
    }
  }

  const openEdit = (b) => {
    setEditing(b)
    setForm({
      tenCoSo: b.tenCoSo ?? '',
      diaChi: b.diaChi ?? '',
      tinhThanh: b.tinhThanh ?? '',
      quanHuyen: b.quanHuyen ?? '',
      soDienThoai: b.soDienThoai ?? '',
      zalo: b.zalo ?? '',
      linkBanDo: b.linkBanDo ?? '',
      moTa: b.moTa ?? '',
      gioMoCua: cut5(b.gioMoCua) || '06:00',
      gioDongCua: cut5(b.gioDongCua) || '22:00',
      soPhutDatToiThieu: String(b.soPhutDatToiThieu ?? 60),
    })
    setImageFile(null)
    setDialogError('')
    setTouched({})
    setSubmitted(false)
    setDialogOpen(true)
  }
  const openDialog = () => {
    setEditing(null)
    setForm(EMPTY_BRANCH_FORM)
    setImageFile(null)
    setDialogError('')
    setTouched({})
    setSubmitted(false)
    setDialogOpen(true)
  }
  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDialogError('')
  }
  // Nhắc lỗi từng ô bắt buộc: hiện sau khi rời khỏi ô, hoặc sau khi bấm Lưu
  const fieldErrors = branchFieldErrors(form)
  const blurField = (key) => () => setTouched((t) => ({ ...t, [key]: true }))
  const errOf = (key) => (touched[key] || submitted ? fieldErrors[key] : '')
  const invalidProps = (key) => (errOf(key) ? { 'aria-invalid': 'true', style: { borderColor: '#b3262b' } } : {})
  const errMsg = (key) => (errOf(key) ? <span className="field-error">{errOf(key)}</span> : null)

  const submit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(fieldErrors).length > 0) {
      // lỗi đã hiện dưới từng ô; đưa con trỏ về ô lỗi đầu tiên
      const first = ['tenCoSo', 'diaChi', 'tinhThanh', 'quanHuyen', 'soDienThoai', 'linkBanDo', 'gioMoCua', 'gioDongCua'].find((k) => fieldErrors[k])
      document.getElementById(`branch-${first}`)?.focus()
      return
    }
    const { body, error: invalid } = validateBranchForm(form)
    if (invalid) {
      setDialogError(invalid)
      return
    }
    setSaving(true)
    setDialogError('')
    try {
      if (editing) {
        // Sửa cơ sở: PUT /api/chu-san/co-so/:maCoSo. Đổi giờ hoạt động thì xử lý bảng giá trước (prepareHoursChange)
        const prep = await prepareHoursChange(token, editing, body.gioMoCua, body.gioDongCua)
        let updated
        try {
          updated = await callApi(`/api/chu-san/co-so/${editing.maCoSo}`, { method: 'PUT', token, body })
        } catch (err) {
          if (prep.restore) await prep.restore()
          throw err
        }
        let imageWarning = ''
        if (imageFile) {
          try {
            const saved = await uploadBranchImage(token, imageFile, editing.maCoSo)
            updated = { ...updated, duongDanAnh: saved.duongDanAnh }
          } catch (err) {
            imageWarning = ` Nhưng chưa lưu được ảnh (${describeApiError(err)}).`
          }
        }
        setBranches((prev) => prev.map((x) => (x.maCoSo === editing.maCoSo ? { ...x, ...updated } : x)))
        setDialogOpen(false)
        setError('')
        setSuccess(`Đã lưu cơ sở ${updated.tenCoSo ?? editing.tenCoSo}.${imageWarning}${prep.reminder ? ` ${prep.reminder}` : ''}`)
        onCreated?.()
        return
      }
      let created = await callApi('/api/chu-san/co-so', { method: 'POST', token, body })
      let imageWarning = ''
      if (imageFile) {
        try {
          const saved = await uploadBranchImage(token, imageFile, created.maCoSo)
          created = { ...created, duongDanAnh: saved.duongDanAnh }
        } catch (err) {
          imageWarning = ` Nhưng chưa lưu được ảnh (${describeApiError(err)}).`
        }
      }
      const next = [...branches, created]
      setBranches(next)
      onCreated?.() // có cơ sở rồi thì mở khoá các trang khác ngay
      setDialogOpen(false)
      setError('')
      setSuccess(`Đã thêm cơ sở ${created.tenCoSo}.${imageWarning}`)
      // đợi danh sách vẽ xong cơ sở mới rồi cuộn xuống cuối
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50)
    } catch (err) {
      setDialogError(describeApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <section className="card branch-card">
        <div className="branch-toolbar">
          <h2 className="card-title">Cơ sở của bạn{branches.length > 0 ? ` (${branches.length})` : ''}</h2>
          <button type="button" className="btn btn-primary" onClick={openDialog}>
            <PlusIcon /> Thêm cơ sở
          </button>
        </div>

        {loading && <p className="table-empty">Đang tải danh sách cơ sở...</p>}
        {!loading && branches.length === 0 && (
          <div className="branch-empty">
            <p>Bạn chưa có cơ sở nào.</p>
            <p className="field-hint">Bấm &quot;Thêm cơ sở&quot; để nhập thông tin cơ sở đầu tiên. Sau đó thêm sân và bảng giá để khách đặt được.</p>
          </div>
        )}
        {branches.length > 0 && (
          <div className="branch-list" ref={listRef}>
            {branches.map((b) => (
              <BranchCard key={b.maCoSo} b={b} busy={busyId === b.maCoSo} onEdit={openEdit} onToggleLock={(x) => setConfirm({ type: x.trangThai === 'closed' ? 'unlock' : 'lock', b: x, lyDo: '', busy: false, error: '' })} onDelete={(x) => setConfirm({ type: 'delete', b: x, lyDo: '', busy: false, error: '' })} />
            ))}
          </div>
        )}
      </section>

      {dialogOpen && (
        <Dialog title={editing ? 'Sửa cơ sở' : 'Thêm cơ sở'} width={640} onClose={() => !saving && setDialogOpen(false)}>
          <form onSubmit={submit} noValidate>
            <div className="branch-form">
              <label className="dialog-field branch-wide">
                <span>Tên cơ sở</span>
                <input id="branch-tenCoSo" className="input" value={form.tenCoSo} onChange={update('tenCoSo')} onBlur={blurField('tenCoSo')} maxLength={150} autoFocus {...invalidProps('tenCoSo')} />
                {errMsg('tenCoSo')}
              </label>
              <label className="dialog-field branch-wide">
                <span>Địa chỉ </span>
                <input id="branch-diaChi" className="input" value={form.diaChi} onChange={update('diaChi')} onBlur={blurField('diaChi')} maxLength={255} placeholder="Số nhà, đường, phường" {...invalidProps('diaChi')} />
                {errMsg('diaChi')}
              </label>
              <label className="dialog-field">
                <span>Tỉnh/Thành </span>
                <select id="branch-tinhThanh" className="input" value={form.tinhThanh} onBlur={blurField('tinhThanh')} {...invalidProps('tinhThanh')} onChange={(e) => setForm((f) => ({ ...f, tinhThanh: e.target.value, quanHuyen: '' }))}>
                  <option value="">Chọn Tỉnh/Thành</option>
                  {[BRANCH_PROVINCE].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {errMsg('tinhThanh')}
              </label>
              <label className="dialog-field">
                <span>Quận/Huyện </span>
                <select id="branch-quanHuyen" className="input" value={form.quanHuyen} onChange={update('quanHuyen')} onBlur={blurField('quanHuyen')} {...invalidProps('quanHuyen')} disabled={!form.tinhThanh}>
                  <option value="">{form.tinhThanh ? 'Chọn Quận/Huyện' : 'Chọn Tỉnh/Thành trước'}</option>
                  {(form.tinhThanh === BRANCH_PROVINCE ? BRANCH_DISTRICTS : []).map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                {errMsg('quanHuyen')}
              </label>
              <label className="dialog-field">
                <span>Số điện thoại </span>
                <input id="branch-soDienThoai" className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} value={form.soDienThoai} onChange={(e) => setForm((f) => ({ ...f, soDienThoai: onlyDigits(e.target.value) }))} onBlur={blurField('soDienThoai')} {...invalidProps('soDienThoai')} />
                {errMsg('soDienThoai')}
              </label>
              <label className="dialog-field">
                <span>Zalo (Tuỳ chọn)</span>
                <input className="input" inputMode="numeric" pattern="[0-9]*" value={form.zalo} onChange={(e) => setForm((f) => ({ ...f, zalo: onlyDigits(e.target.value) }))} maxLength={30} />
              </label>
              <label className="dialog-field branch-wide">
                <span>Link bản đồ (Google Maps) </span>
                <input id="branch-linkBanDo" className="input" type="text" value={form.linkBanDo} onChange={(e) => setForm((f) => ({ ...f, linkBanDo: e.target.value }))} onBlur={(e) => { setForm((f) => ({ ...f, linkBanDo: f.linkBanDo.trim() })); blurField('linkBanDo')(e) }} maxLength={500} placeholder="Dán link Google Maps, ví dụ https://maps.app.goo.gl/..." {...invalidProps('linkBanDo')} />
                {errMsg('linkBanDo')}
              </label>
              <label className="dialog-field">
                <span>Giờ mở cửa </span>
                <input id="branch-gioMoCua" className="input" type="time" value={form.gioMoCua} onChange={update('gioMoCua')} onBlur={blurField('gioMoCua')} {...invalidProps('gioMoCua')} />
                {errMsg('gioMoCua')}
              </label>
              <label className="dialog-field">
                <span>Giờ đóng cửa </span>
                <input id="branch-gioDongCua" className="input" type="time" value={form.gioDongCua} onChange={update('gioDongCua')} onBlur={blurField('gioDongCua')} {...invalidProps('gioDongCua')} />
                {errMsg('gioDongCua')}
              </label>
              <label className="dialog-field">
                <span>Thời gian đặt tối thiểu </span>
                <select className="input" value={form.soPhutDatToiThieu} onChange={update('soPhutDatToiThieu')}>
                  {MIN_BOOKING_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} phút
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-field">
                <span>{editing ? 'Đổi ảnh cơ sở (tuỳ chọn)' : 'Ảnh cơ sở'}</span>
                <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </label>
              <label className="dialog-field branch-wide">
                <span>Mô tả</span>
                <textarea className="input branch-textarea" rows={3} value={form.moTa} onChange={update('moTa')} maxLength={2000} />
              </label>
            </div>
            {!editing && <p className="picker-hint">Cơ sở mới ở trạng thái &quot;Chưa hiển thị cho khách&quot; cho tới khi có sân hoạt động và bảng giá.</p>}
            {dialogError && <p className="dialog-error">{dialogError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Lưu'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {confirm && (
        <Dialog
          title={confirm.type === 'lock' ? 'Khoá cơ sở' : confirm.type === 'unlock' ? 'Mở khoá cơ sở' : 'Xoá cơ sở'}
          width={460}
          onClose={() => !confirm.busy && setConfirm(null)}
        >
          <p className="picker-hint">
            {confirm.type === 'lock' &&
              `Khoá "${confirm.b.tenCoSo}": khách không đặt được cơ sở này; sân, bảng giá và lịch của cơ sở không dùng được cho tới khi mở khoá. Chỉ khoá được khi tất cả sân của cơ sở đã khoá. Mở khoá cơ sở thì các sân vẫn khoá cho tới khi bạn mở từng sân.`}
            {confirm.type === 'unlock' && `Mở khoá "${confirm.b.tenCoSo}" để cơ sở hoạt động trở lại (hiển thị cho khách khi có sân hoạt động và bảng giá).`}
            {confirm.type === 'delete' && `Xoá "${confirm.b.tenCoSo}" khỏi hệ thống? Thao tác này không hoàn tác được. Cơ sở còn đơn đặt hoặc đã từng có đơn đặt thì không xoá được.`}
          </p>
          {confirm.type !== 'unlock' && (
            <label className="dialog-field">
              <span>Lý do (tuỳ chọn)</span>
              <input className="input" value={confirm.lyDo} maxLength={255} onChange={(e) => setConfirm((c) => ({ ...c, lyDo: e.target.value }))} />
            </label>
          )}
          {confirm.error && <p className="dialog-error">{confirm.error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setConfirm(null)} disabled={confirm.busy}>
              Đóng
            </button>
            <button type="button" className={confirm.type === 'delete' ? 'dialog-danger' : 'dialog-primary'} onClick={runConfirm} disabled={confirm.busy}>
              {confirm.busy ? 'Đang xử lý...' : confirm.type === 'lock' ? 'Khoá cơ sở' : confirm.type === 'unlock' ? 'Mở khoá' : 'Xoá cơ sở'}
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}

// Trang Khiếu nại (giao diện kiểu tin nhắn): backend không có API khiếu nại riêng cho chủ sân, nên dùng API có sẵn
// GET /api/thong-bao (thông báo của chính chủ sân) và chỉ lấy thông báo có loaiThamChieu = 'complaint':
//  - complaint_received: khách khiếu nại (nội dung dạng "<tên khách> khiếu nại về đơn <mã đơn> (<cơ sở>)...")
//  - owner_warning / owner_banned: quản trị viên cảnh cáo / khoá tài khoản (kèm "lần vi phạm thứ N/3")
const MAX_WARNINGS = 3

function describeComplaint(n) {
  if (n.loai === 'owner_warning' || n.loai === 'owner_banned') {
    const m = /lần vi phạm thứ (\d)\//.exec(n.noiDung)
    const warnings = n.loai === 'owner_banned' ? MAX_WARNINGS : m ? Number(m[1]) : null
    return { key: 'admin', sender: 'Quản trị viên', fromAdmin: true, warnings, banned: n.loai === 'owner_banned' }
  }
  const m = /^(.+?) khiếu nại về đơn/.exec(n.noiDung)
  const sender = m ? m[1] : 'Khách hàng'
  return { key: `khach:${sender}`, sender, fromAdmin: false, warnings: null, banned: false }
}

const viTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '')

// Cửa sổ Giải trình (khiếu nại của KHÁCH) và Kháng cáo (cảnh cáo của ADMIN).
// API có sẵn: POST /api/chu-san/khieu-nai/:maKhieuNai/phan-hoi (JSON { noiDung } 10–1000 ký tự, mỗi khiếu nại 1 lần, KHÔNG nhận ảnh)
//             POST /api/chu-san/khieu-nai/:maKhieuNai/khang-nghi (multipart: noiDung 10–1000 ký tự + anhBangChung 1–3 ảnh)
// Hạn 24 giờ do backend tính (hanPhanHoi / hanKhangNghi, quaHanPhanHoi / coTheKhangNghi), web không tự tính.
function ComplaintActionDialog({ mode, token, khieuNai, onClose, onDone }) {
  const isAppeal = mode === 'appeal'
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const pick = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    if (!/^image\/(jpeg|png|webp)$/.test(chosen.type)) return setError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
    setError('')
    setFiles([chosen]) // chủ sân chỉ gửi 1 ảnh bằng chứng; chọn ảnh khác sẽ thay ảnh cũ
  }

  const submit = async (e) => {
    e.preventDefault()
    const noiDung = text.trim()
    if (noiDung.length < 10) return setError(isAppeal ? 'Nội dung kháng cáo tối thiểu 10 ký tự.' : 'Nội dung giải trình tối thiểu 10 ký tự.')
    if (noiDung.length > 1000) return setError('Nội dung tối đa 1000 ký tự.')
    if (isAppeal && files.length < 1) return setError('Vui lòng chọn 1 ảnh làm bằng chứng.')
    setBusy(true)
    setError('')
    try {
      if (isAppeal) {
        const body = new FormData()
        body.append('noiDung', noiDung)
        files.forEach((f) => body.append('anhBangChung', f))
        await postMultipart(token, `/api/chu-san/khieu-nai/${khieuNai.maKhieuNai}/khang-nghi`, body)
        onDone('Đã gửi kháng cáo lên quản trị viên. Kết quả sẽ được thông báo cho bạn.')
      } else {
        await callApi(`/api/chu-san/khieu-nai/${khieuNai.maKhieuNai}/phan-hoi`, { method: 'POST', token, body: { noiDung } })
        onDone('Đã gửi giải trình lên quản trị viên.')
      }
    } catch (err) {
      setError(describeApiError(err))
      setBusy(false)
    }
  }

  const han = isAppeal ? khieuNai.hanKhangNghi : khieuNai.hanPhanHoi
  return (
    <Dialog title={isAppeal ? 'Kháng cáo cảnh cáo' : 'Giải trình khiếu nại'} onClose={() => !busy && onClose()} width={520}>
      <form onSubmit={submit} noValidate>
        <div className="refund-summary">
          <div>
            Mã khiếu nại: <strong>{khieuNai.maKhieuNaiHienThi}</strong> · Đơn {khieuNai.maDon}
          </div>
          <div>
            {khieuNai.tenSan} · {toViDate(String(khieuNai.ngay).slice(0, 10))} · {String(khieuNai.gioBatDau).slice(0, 5)} – {String(khieuNai.gioKetThuc).slice(0, 5)}
          </div>
          {han && <div>Hạn gửi: <strong>{viTime(han)}</strong> (24 giờ kể từ lúc nhận)</div>}
        </div>
        <label className="dialog-field">
          <span>{isAppeal ? 'Nội dung kháng cáo *' : 'Giải trình *'}</span>
          <textarea className="input" rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={isAppeal ? 'Nhập lý do xin rút cảnh cáo (tối thiểu 10 ký tự)' : 'Nhập giải trình gửi quản trị viên (tối thiểu 10 ký tự, chỉ gửi được 1 lần)'} autoFocus />
        </label>
        {isAppeal && (
          <>
            <label className="dialog-field">
              <span>Ảnh bằng chứng * (1 ảnh)</span>
              <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} />
            </label>
            {previews.length > 0 && (
              <div className="complaint-previews">
                {previews.map((u, i) => (
                  <div key={u} className="complaint-preview">
                    <img src={u} alt={`Bằng chứng ${i + 1}`} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>Bỏ</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-two">
          <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="submit" className="dialog-primary" disabled={busy}>{busy ? 'Đang gửi...' : isAppeal ? 'Gửi kháng cáo' : 'Gửi giải trình'}</button>
        </div>
      </form>
    </Dialog>
  )
}

const APPEAL_STATUS = { pending: 'đang chờ quản trị viên xem xét', accepted: 'quản trị viên đã chấp nhận (rút cảnh cáo)', rejected: 'quản trị viên đã từ chối', cancelled: 'đã thu hồi' }

function ComplaintsPage({ user }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(isOwner)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [cases, setCases] = useState(new Map()) // GET /api/chu-san/khieu-nai: dữ liệu đầy đủ từng khiếu nại (hạn, giải trình, kháng nghị)
  const [dialog, setDialog] = useState(null) // { mode: 'explain' | 'appeal', khieuNai }
  const [notice, setNotice] = useState('')
  const [reloadCases, setReloadCases] = useState(0)
  const [casesFailed, setCasesFailed] = useState(false) // GET /api/chu-san/khieu-nai lỗi: trang vẫn dùng được, chỉ thiếu nút Giải trình / Kháng cáo
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/khieu-nai?trangThai=all', { token })
      .then((data) => {
        if (cancelled) return
        setCases(new Map((Array.isArray(data) ? data : []).map((k) => [k.maKhieuNai, k])))
        setCasesFailed(false)
      })
      .catch(() => {
        // Không đẩy lỗi lên thanh đỏ của cả trang: danh sách khiếu nại lấy từ /api/thong-bao vẫn hiển thị bình thường.
        if (!cancelled) setCasesFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick, reloadCases])

  const merge = (prev, incoming) => {
    const map = new Map(prev.map((x) => [x.maThongBao, x]))
    incoming.forEach((x) => map.set(x.maThongBao, x))
    return [...map.values()].sort((a, b) => b.maThongBao - a.maThongBao)
  }

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/thong-bao?trang=1&soLuong=50', { token })
      .then((data) => {
        if (cancelled) return
        const complaints = data.cacThongBao.filter((n) => n.loaiThamChieu === 'complaint')
        setItems((prev) => merge(prev, complaints))
        setHasMore(data.cacThongBao.length >= 50)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = page + 1
      const data = await callApi(`/api/thong-bao?trang=${next}&soLuong=50`, { token })
      setItems((prev) => merge(prev, data.cacThongBao.filter((n) => n.loaiThamChieu === 'complaint')))
      setHasMore(data.cacThongBao.length >= 50)
      setPage(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  // Gom thông báo thành các cuộc trò chuyện theo người gửi; quản trị viên luôn ở đầu danh sách
  const threads = []
  const byKey = new Map()
  items.forEach((n) => {
    const info = describeComplaint(n)
    if (!byKey.has(info.key)) {
      const thread = { key: info.key, sender: info.sender, fromAdmin: info.fromAdmin, messages: [], unread: 0, warnings: 0, banned: false }
      byKey.set(info.key, thread)
      threads.push(thread)
    }
    const t = byKey.get(info.key)
    t.messages.push(n) // items đã sắp mới → cũ
    if (!n.daDoc) t.unread += 1
    if (info.warnings) t.warnings = Math.max(t.warnings, info.warnings)
    if (info.banned) t.banned = true
  })
  threads.sort((a, b) => Number(b.fromAdmin) - Number(a.fromAdmin) || b.messages[0].maThongBao - a.messages[0].maThongBao)
  const current = threads.find((t) => t.key === selected) ?? null

  // Mở một cuộc trò chuyện: đánh dấu đã đọc bằng PATCH /api/thong-bao/:maThongBao/da-doc
  const openThread = (thread) => {
    setSelected(thread.key)
    thread.messages
      .filter((m) => !m.daDoc)
      .forEach((m) => {
        callApi(`/api/thong-bao/${m.maThongBao}/da-doc`, { method: 'PATCH', token })
          .then(() => setItems((prev) => prev.map((x) => (x.maThongBao === m.maThongBao ? { ...x, daDoc: true } : x))))
          .catch(() => {})
      })
  }

  // Phân loại theo bên gửi: thông báo từ khách (complaint_received) → Giải trình; từ quản trị viên (cảnh cáo) → Kháng cáo.
  // Cả hai chỉ mở được trong hạn 24 giờ do backend quyết định (quaHanPhanHoi / coTheKhangNghi).
  const renderActions = (m, fromAdmin) => {
    const k = m.maThamChieu ? cases.get(Number(m.maThamChieu)) : null
    if (!k) {
      return casesFailed ? <div className="complaint-state is-late">Chưa tải được chi tiết khiếu nại từ máy chủ nên tạm thời chưa dùng được Giải trình / Kháng cáo. Hệ thống sẽ tự thử lại sau ít phút.</div> : null
    }
    if (!fromAdmin) {
      if (k.phanHoiChuSan) return <div className="complaint-state">Bạn đã giải trình lúc {viTime(k.ngayPhanHoi)}: “{k.phanHoiChuSan}”</div>
      if (k.trangThai !== 'pending') return <div className="complaint-state">Khiếu nại đã được quản trị viên xử lý.</div>
      if (k.quaHanPhanHoi) return <div className="complaint-state is-late">Đã quá hạn giải trình (24 giờ).</div>
      return (
        <div className="complaint-actions">
          <button type="button" className="btn btn-sm btn-approve" onClick={() => { setNotice(''); setDialog({ mode: 'explain', khieuNai: k }) }}>Giải trình</button>
          <span className="complaint-hint">Hạn: {viTime(k.hanPhanHoi)}</span>
        </div>
      )
    }
    if (k.maKhangNghi) return <div className="complaint-state">Đã gửi kháng cáo: {APPEAL_STATUS[k.trangThaiKhangNghi] ?? k.trangThaiKhangNghi}.</div>
    if (k.trangThai !== 'upheld') return null
    if (!k.coTheKhangNghi) return <div className="complaint-state is-late">Không thể kháng cáo (đã quá hạn 24 giờ hoặc cảnh cáo không còn hiệu lực).</div>
    return (
      <div className="complaint-actions">
        <button type="button" className="btn btn-sm btn-reject" onClick={() => { setNotice(''); setDialog({ mode: 'appeal', khieuNai: k }) }}>Kháng cáo</button>
        <span className="complaint-hint">Hạn: {viTime(k.hanKhangNghi)}</span>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      {dialog && (
        <ComplaintActionDialog
          mode={dialog.mode}
          token={token}
          khieuNai={dialog.khieuNai}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null)
            setNotice(msg)
            setReloadCases((n) => n + 1)
          }}
        />
      )}
      <section className="card chat-card">
        <aside className="chat-list">
          {loading && <p className="table-empty">Đang tải...</p>}
          {!loading && threads.length === 0 && <p className="table-empty">Chưa có khiếu nại nào.</p>}
          {threads.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`chat-item${current?.key === t.key ? ' is-active' : ''}${t.unread ? ' is-unread' : ''}`}
              onClick={() => openThread(t)}
            >
              <span className={`chat-avatar${t.fromAdmin ? ' is-admin' : ''}`}>{t.sender.trim().charAt(0).toUpperCase()}</span>
              <span className="chat-item-body">
                <span className="chat-item-top">
                  <strong>{t.sender}</strong>
                  <small>{new Date(t.messages[0].ngayTao).toLocaleDateString('vi-VN')}</small>
                </span>
                <span className="chat-item-preview">{t.messages[0].noiDung}</span>
              </span>
              {t.unread > 0 && <span className="chat-badge">{t.unread}</span>}
            </button>
          ))}
          {hasMore && (
            <button type="button" className="btn btn-ghost btn-sm chat-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải...' : 'Xem thêm tin cũ hơn'}
            </button>
          )}
        </aside>

        <div className="chat-detail">
          {!current && <p className="chat-placeholder">Chọn một người gửi ở bên trái để xem nội dung khiếu nại.</p>}
          {current && (
            <>
              <div className="chat-detail-head">
                <span className={`chat-avatar${current.fromAdmin ? ' is-admin' : ''}`}>{current.sender.trim().charAt(0).toUpperCase()}</span>
                <strong>{current.sender}</strong>
                {/* Tin từ quản trị viên: chỉ số cảnh cáo, đủ 3 lần thì tài khoản bị khoá */}
                {current.fromAdmin && (
                  <span className={`warn-badge${current.banned ? ' is-banned' : ''}`}>
                    {current.banned ? `Cảnh cáo ${MAX_WARNINGS}/${MAX_WARNINGS} · Tài khoản đã bị khoá` : `Cảnh cáo ${current.warnings}/${MAX_WARNINGS}`}
                  </span>
                )}
              </div>
              <div className="chat-messages">
                {[...current.messages].reverse().map((m) => (
                  <div key={m.maThongBao} className="chat-bubble">
                    <strong>{m.tieuDe}</strong>
                    <p>{m.noiDung}</p>
                    <small>{viTime(m.ngayTao)}</small>
                    {renderActions(m, current.fromAdmin)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </Page>
  )
}

function CourtsPage({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branches, setBranches] = useState([]) // các cơ sở của chủ sân (có thể nhiều cơ sở)
  const [filterId, setFilterId] = useState('all') // bộ lọc bảng sân: 'all' = tất cả cơ sở
  const [addBranchId, setAddBranchId] = useState('') // cơ sở được chọn trong form Thêm sân
  const [courts, setCourts] = useState([])
  const [busyCourts, setBusyCourts] = useState(new Set()) // sân còn khách đặt (đơn hiện tại/sắp tới)
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false) // cửa sổ Thêm sân
  const [addError, setAddError] = useState('')
  const [giaTheoCoSo, setGiaTheoCoSo] = useState({}) // maCoSo → bảng giá (khungGias) của cơ sở đó, để hiện giá theo từng cơ sở
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Danh sách cơ sở của tài khoản (API có sẵn GET /api/chu-san/co-so)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data ? [data] : []
        setBranches(list)
        setAddBranchId((cur) => (cur && list.some((b) => String(b.maCoSo) === cur) ? cur : list[0] ? String(list[0].maCoSo) : ''))
        if (list.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])

  // Sân theo bộ lọc cơ sở (mặc định tất cả cơ sở) + các đơn còn hiệu lực để biết sân nào còn khách (được phép xoá hay chưa)
  useEffect(() => {
    if (!isOwner || branches.length === 0) return
    let cancelled = false
    const locCoSo = filterId === 'all' ? '' : `maCoSo=${filterId}`
    async function load() {
      try {
        const [cacSan, bangGias, don] = await Promise.all([
          callApi(`/api/chu-san/san${locCoSo ? `?${locCoSo}` : ''}`, { token }),
          // Bảng giá theo từng cơ sở (API có sẵn GET /api/chu-san/co-so/:maCoSo/bang-gia)
          Promise.all(branches.map((b) => callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { token }).catch(() => null))),
          callApi(`/api/chu-san/dat-san?${locCoSo ? `${locCoSo}&` : ''}tuNgay=${todayISO()}&soDong=200`, { token }),
        ])
        if (cancelled) return
        const bayGio = new Date(nowMs())
        const conKhach = new Set(
          (don.cacDon ?? [])
            .filter((d) => {
              // Giống backend: đơn chuyển khoản chờ duyệt còn hạn giữ chỗ, hoặc đơn đã xác nhận mà CHƯA qua giờ kết thúc (đơn cũ/đã qua ngày không tính)
              if (d.trangThai === 'pending_payment') return !d.hetHanGiuCho || Number.isNaN(Date.parse(d.hetHanGiuCho)) || new Date(d.hetHanGiuCho.replace(' ', 'T')) > bayGio
              if (d.trangThai !== 'confirmed' && d.trangThai !== 'checked_in') return false
              return new Date(`${String(d.ngay).slice(0, 10)}T${cut5(d.gioKetThuc)}:00+07:00`) > bayGio
            })
            .map((d) => d.maSan),
        )
        setCourts(cacSan)
        setBusyCourts(conKhach)
        const gia = {}
        bangGias.forEach((g) => {
          if (g) gia[g.maCoSo] = g.khungGias ?? []
        })
        setGiaTheoCoSo(gia)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, filterId, branches, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const branch = branches.find((b) => String(b.maCoSo) === addBranchId) ?? null
  const branchOf = (maCoSo) => branches.find((b) => b.maCoSo === maCoSo)
  const themDuoc = branches.filter((b) => !isBranchBlocked(b)) // chỉ thêm sân vào cơ sở không bị khoá

  // Giá hiện tại của sân = giá của CƠ SỞ chứa sân theo Quản lý bảng giá (thời điểm hiện tại, ngày thường / cuối tuần)
  const priceOf = (court) => {
    const khungGias = giaTheoCoSo[court.maCoSo] ?? []
    const gia = priceAt(khungGias, new Date(nowMs()))
    if (gia != null) return `${formatVnd(gia)}/giờ`
    return khungGias.length > 0 ? 'Ngoài giờ' : '—'
  }

  const courtCols = [
    { key: 'san', label: 'Sân', type: 'text', get: (c) => c.tenSan },
    { key: 'coSo', label: 'Cơ sở', type: 'text', get: (c) => c.tenCoSo ?? branchOf(c.maCoSo)?.tenCoSo },
    { key: 'gia', label: 'Giá', type: 'number', get: (c) => priceAt(giaTheoCoSo[c.maCoSo] ?? [], new Date(nowMs())) },
    { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (c) => (c.trangThai === 'active' && !isBranchBlocked(branchOf(c.maCoSo)) ? 'Hoạt động' : 'Đã khoá') },
  ]
  const changeFilter = (e) => {
    setFilterId(e.target.value)
    setCourts([])
    setLoading(true)
    setError('')
    setSuccess('')
  }

  // Khoá sân / Mở khoá sân: sân bị khoá thì khách (app) không đặt được nữa, đơn đã đặt vẫn giữ nguyên
  // Bảng giá phải phủ hết giờ hoạt động của cơ sở thì mới được mở khoá sân (trả về thông báo lỗi hoặc null).
  // API có sẵn GET /api/chu-san/co-so/:maCoSo/bang-gia (đọc mới nhất, không dùng dữ liệu cũ).
  const kiemTraBangGia = async (maCoSo) => {
    const bg = await callApi(`/api/chu-san/co-so/${maCoSo}/bang-gia`, { token })
    if ((bg.khungGias ?? []).length === 0) return `Chưa thể mở khoá sân: cơ sở "${bg.tenCoSo}" chưa có bảng giá. Hãy thêm bảng giá ở trang Quản lý bảng giá.`
    const open = cut5(bg.gioMoCua)
    const close = cut5(bg.gioDongCua)
    const gaps = findPriceGaps((bg.khungGias ?? []).map(toRow), open, close)
    if (gaps.length === 0) return null
    return `Chưa thể mở khoá sân: bảng giá của "${bg.tenCoSo}" chưa phủ hết giờ hoạt động ${open}–${close} (thiếu ${gaps.join(', ')}). Hãy bổ sung ở trang Quản lý bảng giá.`
  }

  const toggleStatus = async (court) => {
    const closing = court.trangThai === 'active'
    setError('')
    setSuccess('')
    if (closing && busyCourts.has(court.maSan)) {
      setError(`Sân "${court.tenSan}" còn đơn đặt (đã thanh toán hoặc đã xác nhận). Hãy huỷ đơn ở trang Quản lý đặt sân, khi sân đã trống mới khoá được.`)
      return
    }
    if (!closing && isBranchBlocked(branchOf(court.maCoSo))) {
      setError('Cơ sở đang bị khoá nên chưa mở được sân.')
      return
    }
    setBusyId(court.maSan)
    try {
      if (!closing) {
        const thieu = await kiemTraBangGia(court.maCoSo)
        if (thieu) {
          setError(thieu)
          return
        }
      }
      const updated = await callApi(`/api/chu-san/san/${court.maSan}/${closing ? 'dong' : 'mo'}`, {
        method: 'PATCH',
        token,
        body: {},
      })
      setCourts((prev) => prev.map((c) => (c.maSan === court.maSan ? { ...c, ...updated } : c)))
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  // Xoá mềm sân (API có sẵn DELETE /api/chu-san/san/:maSan: đánh dấu DaXoa, không xoá hẳn dòng dữ liệu):
  // sân biến mất khỏi chủ sân và khách, nhưng đơn cũ vẫn giữ tên sân để hiện trong Lịch sử của khách. Chỉ khi sân đã khoá và không còn khách đặt.
  const deleteCourt = async (court) => {
    if (!window.confirm(`Xoá sân "${court.tenSan}"?\nSân sẽ không còn hiển thị với chủ sân và khách hàng, nhưng dữ liệu không bị xoá hẳn nên lịch sử đặt sân của khách vẫn còn tên sân này.`)) return
    setBusyId(court.maSan)
    setError('')
    setSuccess('')
    try {
      await callApi(`/api/chu-san/san/${court.maSan}`, { method: 'DELETE', token, body: {} })
      setCourts((prev) => prev.filter((c) => c.maSan !== court.maSan))
      setSuccess(`Đã xoá ${court.tenSan} (xoá mềm: ẩn khỏi chủ sân và khách, vẫn giữ trong lịch sử đặt sân của khách).`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const openAddDialog = () => {
    setAddError('')
    setNewName('')
    const loc = themDuoc.find((b) => String(b.maCoSo) === filterId)
    setAddBranchId(String((loc ?? themDuoc[0])?.maCoSo ?? '')) // mặc định chọn cơ sở đang lọc (nếu không bị khoá)
    setAddOpen(true)
  }

  // Thêm sân mới vào cơ sở đã chọn: sân ở trạng thái Hoạt động ngay
  const addCourt = async (e) => {
    e.preventDefault()
    const tenSan = newName.trim()
    setAddError('')
    if (!tenSan) {
      setAddError('Vui lòng nhập tên sân.')
      return
    }
    if (!branch) {
      setAddError('Vui lòng chọn cơ sở.')
      return
    }
    setAdding(true)
    try {
      // Sân mới luôn ở trạng thái Đã khoá (backend mặc định); chỉ mở được khi cơ sở đã có bảng giá
      const created = await callApi('/api/chu-san/san', {
        method: 'POST',
        token,
        body: { maCoSo: branch.maCoSo, tenSan },
      })
      setCourts((prev) => [...prev, created])
      setNewName('')
      setError('')
      setSuccess(`Đã thêm ${created.tenSan} vào ${branch.tenCoSo}. Sân đang ở trạng thái Đã khoá, chỉ mở khoá được khi bảng giá phủ hết giờ hoạt động của cơ sở.`)
      setAddOpen(false)
      // Sân mới thuộc cơ sở khác với bộ lọc đang xem thì chuyển bộ lọc sang cơ sở đó để thấy ngay
      if (filterId !== 'all' && filterId !== addBranchId) setFilterId(addBranchId)
    } catch (err) {
      setAddError(describeApiError(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* Lọc sân theo cơ sở: mặc định hiển thị tất cả sân của mọi cơ sở */}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={filterId} onChange={changeFilter}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* Nút mở cửa sổ Thêm sân, nằm cạnh ô chọn cơ sở */}
        <button type="button" className="btn btn-primary" onClick={openAddDialog} disabled={themDuoc.length === 0}>
          <PlusIcon /> Thêm sân
        </button>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-courts">
            <thead>
              <tr>
                <SortTh cols={courtCols} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={courtCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={courtCols} k="gia" sel={sortSel} onSel={setSortSel}>Giá</SortTh>
                <SortTh cols={courtCols} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                <th className="th-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Đang tải danh sách sân...
                  </td>
                </tr>
              )}
              {!loading && courts.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Chưa có sân nào.
                  </td>
                </tr>
              )}
              {sortRows(courts, courtCols, sortSel).map((c) => {
                const coSoKhoa = isBranchBlocked(branchOf(c.maCoSo)) // cơ sở bị khoá → sân tự khoá theo
                const active = c.trangThai === 'active'
                const conKhach = busyCourts.has(c.maSan)
                const coTheXoa = c.trangThai !== 'active' && !conKhach
                let tieuDeXoa = 'Xoá sân (xoá mềm: ẩn khỏi chủ sân và khách, giữ lại trong lịch sử của khách)'
                if (c.trangThai === 'active') tieuDeXoa = 'Cần khoá sân trước khi xoá'
                else if (conKhach) tieuDeXoa = 'Sân còn khách đã đặt, chưa xoá được'
                return (
                  <tr key={c.maSan}>
                    <td>{c.tenSan}</td>
                    <td>{c.tenCoSo ?? branch?.tenCoSo}</td>
                    <td>{priceOf(c)}</td>
                    <td>
                      <span className={`status-badge ${active ? 'status-ok' : 'status-maint'}`}>{active ? (coSoKhoa ? 'Hoạt động (cơ sở bị khoá)' : 'Hoạt động') : 'Đã khoá'}</span>
                    </td>
                    <td className="td-center">
                      <div className="row-actions row-actions-center">
                        {/* Ổ khoá: sân hoạt động hiện ổ khoá mở (bấm để khoá sân); sân đã khoá hiện ổ khoá đóng (bấm để mở khoá) */}
                        <button
                          type="button"
                          className={`icon-btn icon-btn-wrench${active ? '' : ' is-on'}`}
                          onClick={() => toggleStatus(c)}
                          disabled={busyId === c.maSan || (coSoKhoa && !active)}
                          title={coSoKhoa && !active ? 'Cơ sở đang bị khoá nên chưa mở được sân' : active && busyCourts.has(c.maSan) ? 'Sân còn đơn đặt — huỷ đơn trước khi khoá' : active ? 'Khoá sân' : 'Sân đang khoá — bấm để mở khoá (cần bảng giá phủ hết giờ hoạt động của cơ sở)'}
                          aria-label={active ? 'Khoá sân' : 'Mở khoá sân'}
                        >
                          {active ? <LockOpenIcon /> : <LockClosedIcon />}
                        </button>
                        {/* Thùng rác đỏ: chỉ dùng được khi sân đã đóng và không còn khách đặt */}
                        <button
                          type="button"
                          className="icon-btn icon-btn-trash"
                          onClick={() => deleteCourt(c)}
                          disabled={!coTheXoa || busyId === c.maSan}
                          title={tieuDeXoa}
                          aria-label="Xoá sân"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <Dialog title="Thêm sân" width={460} onClose={() => !adding && setAddOpen(false)}>
          <form onSubmit={addCourt} noValidate>
            <label className="dialog-field">
              <span>Tên sân *</span>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} autoFocus />
            </label>
            <label className="dialog-field">
              <span>Cơ sở *</span>
              <select className="input" value={addBranchId} onChange={(e) => setAddBranchId(e.target.value)}>
                {themDuoc.map((b) => (
                  <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                    {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {addError && <p className="dialog-error">{addError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={adding || !branch}>
                {adding ? 'Đang thêm...' : 'Thêm sân'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Page>
  )
}

// Bảng giá của cơ sở: mỗi khung giờ có giá riêng cho từng thứ trong tuần (backend `giaTheoThu`, 7 thứ).
// Web hiển thị giá vãng lai và khi lưu gửi cùng một giá cho cả hai loại khách.
const MAX_PRICE = 10_000_000

const toMinutes = (t) => {
  const [h, m] = String(t).split(':')
  return Number(h) * 60 + Number(m)
}
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const cut5 = (t) => String(t ?? '').slice(0, 5)

function toRow(k) {
  const row = { gioBatDau: cut5(k.gioBatDau), gioKetThuc: cut5(k.gioKetThuc), saved: true } // saved = đã có trong database
  row.gia = [1, 2, 3, 4, 5, 6, 7].map((thu) => {
    const g = giaCuaThu(k, thu)
    return g == null ? '' : String(g)
  }) // giá từng thứ: gia[0] = Thứ 2 … gia[6] = Chủ nhật
  return row
}

// Trả về thông báo lỗi (khớp quy tắc của backend) hoặc null nếu hợp lệ
function validatePricing(rows, open, close) {
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
function findPriceGaps(rows, open, close) {
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

const DAY_NAMES = [
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
function daysText(days) {
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

// Cửa sổ chung (nền mờ + hộp có tiêu đề và nút đóng)
// fit = cửa sổ chứa bảng: rộng và dài ra theo bảng (tối đa gần hết màn hình), chỉ phần bảng cuộn, tiêu đề + cột đầu được đóng băng
function Dialog({ title, onClose, children, level = 1, width = 480, fit = false }) {
  return (
    <div className={`dialog-backdrop dialog-level-${level}`}>
      <div className={`dialog${fit ? ' dialog-fit' : ''}`} style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Chọn khung giờ (bấm giờ bắt đầu rồi giờ kết thúc); bước 30 hoặc 60 phút
function TimeRangeDialog({ open, close, initial, onConfirm, onClose }) {
  const [step, setStep] = useState(30)
  const [start, setStart] = useState(initial?.[0] ?? null)
  const [end, setEnd] = useState(initial?.[1] ?? null)

  const slots = []
  for (let m = toMinutes(open); m <= toMinutes(close); m += step) slots.push(toHHMM(m))
  // Dù chia theo 30 hay 60 phút vẫn luôn hiển thị giờ mở cửa (mốc đầu) và giờ đóng cửa (mốc cuối)
  if (slots[slots.length - 1] !== toHHMM(toMinutes(close))) slots.push(toHHMM(toMinutes(close)))

  const pick = (t) => {
    if (start === null || end !== null) {
      setStart(t)
      setEnd(null)
    } else if (toMinutes(t) > toMinutes(start)) {
      setEnd(t)
    } else {
      setStart(t)
    }
  }
  const changeStep = (v) => {
    setStep(v)
    setStart(null)
    setEnd(null)
  }

  return (
    <Dialog title="Chọn khung giờ" level={2} width={640} onClose={onClose}>
      <div className="picker-step">
        <span>Sắp xếp thời gian theo (phút):</span>
        <div className="step-toggle" role="group" aria-label="Sắp xếp thời gian theo 30 hoặc 60 phút">
          {[30, 60].map((v) => (
            <button key={v} type="button" className={`step-toggle-btn${step === v ? ' is-active' : ''}`} aria-pressed={step === v} onClick={() => changeStep(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <p className="picker-hint">Bấm giờ bắt đầu rồi bấm giờ kết thúc.</p>
      <div className="slot-grid">
        {slots.map((t) => {
          const inRange = start && end && toMinutes(t) >= toMinutes(start) && toMinutes(t) <= toMinutes(end)
          const edge = t === start || t === end
          return (
            <button key={t} type="button" className={`slot-pick${inRange ? ' in-range' : ''}${edge ? ' is-edge' : ''}`} onClick={() => pick(t)}>
              {t}
            </button>
          )
        })}
      </div>
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose}>
          Thoát
        </button>
        <button type="button" className="dialog-primary" disabled={!start || !end} onClick={() => onConfirm([start, end])}>
          Chọn
        </button>
      </div>
    </Dialog>
  )
}

// Chọn thứ: bấm từng thứ một để chọn / bỏ chọn, chọn tự do bất kỳ thứ nào (vd T2, T4, T6).
function DayRangeDialog({ initial, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(initial ?? []))
  const [error, setError] = useState('')

  const toggle = (n) => {
    setError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }
  const confirm = () => {
    const list = [...selected].sort((a, b) => a - b)
    if (list.length === 0) return setError('Vui lòng chọn ít nhất một thứ.')
    onConfirm(list)
  }

  return (
    <Dialog title="Chọn thứ" level={2} width={480} onClose={onClose}>
      <div className="day-row">
        {DAY_NAMES.map((d) => {
          const on = selected.has(d.n)
          return (
            <button key={d.n} type="button" className={`day-circle${on ? ' in-range is-edge' : ''}`} aria-pressed={on} onClick={() => toggle(d.n)}>
              {d.short}
            </button>
          )
        })}
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button
          type="button"
          className="dialog-danger"
          onClick={() => {
            setSelected(new Set())
            setError('')
          }}
        >
          Xóa
        </button>
        <button type="button" className="dialog-primary" onClick={confirm}>
          Chọn
        </button>
      </div>
      <button type="button" className="dialog-ghost dialog-exit" onClick={onClose}>
        Thoát
      </button>
    </Dialog>
  )
}


// Cửa sổ thêm / sửa khung giờ: cơ sở, tên sự kiện, khung giờ, thứ, giá. Nút Thêm / Lưu ghi thẳng vào database.
function AddPriceDialog({ branches, defaultBranchId, mode = 'add', initial, lockName = false, onSubmit, onClose }) {
  const [maCoSo, setMaCoSo] = useState(String(defaultBranchId ?? branches[0]?.maCoSo ?? ''))
  const [ten, setTen] = useState(initial?.ten ?? '')
  const [time, setTime] = useState(initial?.time ?? null)
  const [days, setDays] = useState(initial?.days ?? null)
  const [gia, setGia] = useState(initial?.gia ?? '')
  const [showTime, setShowTime] = useState(false)
  const [showDays, setShowDays] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const chosen = branches.find((b) => String(b.maCoSo) === maCoSo) ?? null
  const open = cut5(chosen?.gioMoCua)
  const close = cut5(chosen?.gioDongCua)

  const changeBranch = (e) => {
    setMaCoSo(e.target.value)
    setTime(null) // mỗi cơ sở có giờ mở cửa riêng nên chọn lại khung giờ
    setError('')
  }

  const submit = async () => {
    if (!chosen) return setError('Vui lòng chọn cơ sở.')
    if (!time) return setError('Vui lòng chọn khung giờ.')
    if (!days) return setError('Vui lòng chọn thứ.')
    const v = Number(gia)
    if (gia === '' || !Number.isInteger(v) || v < 0 || v > MAX_PRICE) {
      return setError(`Giá phải là số nguyên từ 0 đến ${MAX_PRICE.toLocaleString('vi-VN')}.`)
    }
    setBusy(true)
    const message = await onSubmit({ id: initial?.id, maCoSo: chosen.maCoSo, ten: ten.trim(), time, days, gia: String(v) })
    setBusy(false)
    if (message) return setError(message)
    onClose()
  }

  return (
    <>
      <Dialog title={mode === 'edit' ? 'Sửa khung giờ' : 'Thêm khung giờ'} level={1} width={520} onClose={() => !busy && onClose()}>
        <label className="dialog-field">
          <span>Cơ sở:</span>
          <select className="input" value={maCoSo} onChange={changeBranch} disabled={mode === 'edit' || busy}>
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="dialog-field">
          <span>Tên sự kiện:</span>
          <input
            className="input"
            type="text"
            placeholder="Có thể bỏ trống (hiển thị Giờ cố định)"
            maxLength={50}
            value={ten}
            onChange={(e) => setTen(e.target.value)}
            disabled={lockName}
          />
        </label>

        <div className="dialog-field">
          <span>Chọn khung giờ:</span>
          {time ? (
            <button type="button" className="pill-group" onClick={() => setShowTime(true)}>
              <span className="pill">{time[0]}</span> - <span className="pill">{time[1]}</span>
            </button>
          ) : (
            <button type="button" className="dialog-outline" onClick={() => setShowTime(true)}>
              Chọn khung giờ
            </button>
          )}
          {open && (
            <small className="dialog-note">
              Giờ mở cửa của cơ sở: {open}–{close}. Khung giờ không được trùng khung đã có của cùng cơ sở VÀ có thứ chung (khác cơ sở, hoặc không có thứ nào chung thì được trùng giờ).
            </small>
          )}
        </div>

        <div className="dialog-field">
          <span>Chọn thứ:</span>
          {days ? (
            <button type="button" className="pill-group" onClick={() => setShowDays(true)}>
              <span className="pill">{daysText(days)}</span>
            </button>
          ) : (
            <button type="button" className="dialog-outline" onClick={() => setShowDays(true)}>
              Chọn thứ
            </button>
          )}
          {days && days.length < 7 && (
            <small className="dialog-note">Backend cần đủ giá cho 7 thứ: thứ không chọn (nếu chưa có khung giá khác phủ giờ đó) tạm dùng cùng mức giá này.</small>
          )}
        </div>

        <label className="dialog-field">
          <span>Giá (đ/giờ):</span>
          <input className="input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="Nhập giá" value={gia} onChange={(e) => setGia(onlyDigits(e.target.value))} />
        </label>

        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-two">
          <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="button" className="dialog-primary" onClick={submit} disabled={busy}>
            {busy ? 'Đang lưu...' : mode === 'edit' ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </Dialog>

      {showTime && (
        <TimeRangeDialog
          open={open}
          close={close}
          initial={time}
          onClose={() => setShowTime(false)}
          onConfirm={(t) => {
            setTime(t)
            setError('')
            setShowTime(false)
          }}
        />
      )}
      {showDays && (
        <DayRangeDialog
          initial={days}
          onClose={() => setShowDays(false)}
          onConfirm={(d) => {
            setDays(d)
            setError('')
            setShowDays(false)
          }}
        />
      )}
    </>
  )
}

// Bảng giá được ghép từ các "dòng giá": mỗi dòng = 1 khung giờ + loại ngày (T2–T6 / T7–CN / cả tuần) + giá.
// Backend chỉ lưu theo khung giờ với 2 mức giá (ngày thường, cuối tuần) nên: tên sự kiện, loại ngày đã chọn và
// khung theo ngày được ghi nhớ trên trình duyệt này (localStorage).
const keyOfTime = (time) => `${time[0]}-${time[1]}`
const priceMetaKey = (maCoSo) => `bangGiaMeta:${maCoSo}`

function readPriceMeta(maCoSo) {
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

function writePriceMeta(maCoSo, entries, dated) {
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
function rowsFromEntries(entries) {
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
function restoreEntries(rows, meta) {
  if (Array.isArray(meta.entries) && meta.entries.length > 0) {
    const entries = meta.entries.map(normEntry)
    if (rowsSig(rowsFromEntries(entries)) === rowsSig(rows)) return entries
  }
  return entriesFromRows(rows, meta)
}

// Tìm khung giá MỚI (newId) trùng giờ + trùng thứ với một khung đã có (khác loại thứ thì được trùng giờ)
function findClassOverlap(entries, newId) {
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

// Quản lý bảng giá theo từng cơ sở. API có sẵn:
//   GET /api/chu-san/co-so (danh sách cơ sở), GET /api/chu-san/co-so/:maCoSo/bang-gia (xem bảng giá),
//   POST /api/chu-san/co-so/:maCoSo/bang-gia (thêm một khung giờ), PUT /api/chu-san/co-so/:maCoSo/bang-gia (sửa / xóa khung giờ),
//   PUT /api/chu-san/co-so/:maCoSo (sửa giờ mở cửa)
const ALL_BRANCHES_ID = 'all'

function PricingPage({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branches, setBranches] = useState([]) // các cơ sở của chủ sân
  const [selectedId, setSelectedId] = useState(ALL_BRANCHES_ID) // cơ sở đang xem ("all" = tất cả cơ sở)
  const [data, setData] = useState({}) // maCoSo → { branch: { maCoSo, tenCoSo, gioMoCua, gioDongCua }, entries }
  const [loading, setLoading] = useState(isOwner)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dialog, setDialog] = useState(null) // { mode, ten, lockName, initial }
  const [hoursDialog, setHoursDialog] = useState(null) // { maCoSo, open, close, error, busy }
  const [reloadKey, setReloadKey] = useState(0)

  // Danh sách cơ sở
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp) ? resp : resp ? [resp] : []
        setBranches(list)
        setSelectedId((cur) => (cur === ALL_BRANCHES_ID || list.some((b) => String(b.maCoSo) === cur) ? cur : ALL_BRANCHES_ID))
        if (list.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ type: 'error', message: describeApiError(err) })
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])

  // Bảng giá của các cơ sở đang xem (một cơ sở, hoặc tất cả)
  const visibleIds = selectedId === ALL_BRANCHES_ID ? branches.map((b) => String(b.maCoSo)) : [selectedId]
  const visibleKey = visibleIds.join(',')
  useEffect(() => {
    if (!isOwner || !visibleKey) return
    let cancelled = false
    setLoading(true)
    Promise.all(
      visibleKey.split(',').map((id) =>
        callApi(`/api/chu-san/co-so/${id}/bang-gia`, { token }).then(
          (d) => ({
            id,
            value: {
              branch: { maCoSo: d.maCoSo, tenCoSo: d.tenCoSo, gioMoCua: d.gioMoCua, gioDongCua: d.gioDongCua },
              entries: restoreEntries((d.khungGias ?? []).map(toRow), readPriceMeta(d.maCoSo)),
            },
          }),
          (err) => ({ id, error: describeApiError(err) }),
        ),
      ),
    ).then((list) => {
      if (cancelled) return
      const next = {}
      const errors = []
      list.forEach((r) => {
        if (r.value) next[r.id] = r.value
        else errors.push(r.error)
      })
      setData(next)
      if (errors.length > 0) setResult({ type: 'error', message: errors[0] })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, visibleKey, reloadKey])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const showAll = selectedId === ALL_BRANCHES_ID
  // Cơ sở bị khoá: bảng giá giữ nguyên nhưng không sửa được
  const idKhoa = (id) => isBranchBlocked(branches.find((b) => String(b.maCoSo) === String(id)))
  const themDuoc = branches.filter((b) => !isBranchBlocked(b))
  const blocksGoc = visibleIds.map((id) => data[id]).filter(Boolean) // các cơ sở đang hiển thị (đã tải xong)
  // Sắp xếp: theo cơ sở (khi xem tất cả cơ sở), hoặc theo sự kiện / khung giờ / giá trong từng cơ sở
  const pricingCols = [
    ...(showAll ? [{ key: 'coSo', label: 'Cơ sở', type: 'text', get: (b) => b.branch.tenCoSo }] : []),
    { key: 'ten', label: 'Tên sự kiện', type: 'text', get: (g) => g.ten },
    { key: 'thu', label: 'Thứ', type: 'number', get: (g) => Math.min(...g.items.map((i) => i.days[0])) },
    { key: 'gio', label: 'Khung giờ', type: 'time', get: (g) => String(Math.min(...g.items.map((i) => toMinutes(i.time[0])))).padStart(4, '0') },
    { key: 'gia', label: 'Giá', type: 'number', get: (g) => Math.min(...g.items.map((i) => Number(i.gia))) },
  ]
  const blocks = sortRows(blocksGoc, pricingCols.filter((c) => c.key === 'coSo'), sortSel) // sắp xếp cơ sở
  const single = !showAll ? data[selectedId] : null

  const changeBranch = (e) => {
    setSelectedId(e.target.value)
    setData({})
    setResult(null)
  }

  const setEntriesOf = (id, entries) => setData((d) => (d[id] ? { ...d, [id]: { ...d[id], entries } } : d))

  // Dựng lại bảng của một cơ sở từ khung giá backend vừa trả về (sau khi sửa / xóa)
  const applyServerRows = (id, savedRows, nextEntries) => {
    writePriceMeta(id, nextEntries, [])
    setEntriesOf(String(id), restoreEntries(savedRows.map(toRow), readPriceMeta(id)))
  }

  // Gửi bảng giá của một cơ sở lên database (PUT thay toàn bộ bảng giá của cơ sở đó)
  const putRows = (idCoSo, list) =>
    callApi(`/api/chu-san/co-so/${idCoSo}/bang-gia`, {
      method: 'PUT',
      token,
      body: {
        khungGias: list.map((r) => ({
          gioBatDau: r.gioBatDau,
          gioKetThuc: r.gioKetThuc,
          giaTheoThu: r.gia.map((g, i) => ({ thu: i + 1, giaKhachVangLai: Number(g), giaKhachCoDinh: Number(g) })),
        })),
      },
    })

  // Nút Thêm / Lưu trong cửa sổ: ghi thẳng vào database, trả về thông báo lỗi (hoặc null nếu thành công)
  const submitEntry = async ({ id, maCoSo: idCoSo, ten, time, days, gia }) => {
    if (idKhoa(idCoSo)) return 'Cơ sở đang bị khoá nên không sửa được bảng giá.'
    const [s, e] = time

    if (!id) {
      // Thêm khung mới: backend (POST thêm 1 khung) chặn mọi khung trùng giờ mà không biết thứ, nên web ghép lại
      // cả bảng giá (khung cũ + khung mới) rồi lưu bằng PUT: khác loại thứ (T2–T6 / T7–CN) thì được trùng giờ.
      try {
        const cur = await callApi(`/api/chu-san/co-so/${idCoSo}/bang-gia`, { token })
        const open = cut5(cur.gioMoCua)
        const close = cut5(cur.gioDongCua)
        const cu = restoreEntries((cur.khungGias ?? []).map(toRow), readPriceMeta(idCoSo))
        const moiId = `moi-${Date.now()}`
        const next = [...cu, { id: moiId, ten, time, days, gia: String(Number(gia)) }]
        const trung = findClassOverlap(next, moiId)
        if (trung) return trung
        const message = validatePricing(rowsFromEntries(next), open, close)
        if (message) return message
        const saved = await putRows(idCoSo, rowsFromEntries(next))
        applyServerRows(idCoSo, saved, next)
        if (showAll || String(idCoSo) === selectedId) {
          setReloadKey((n) => n + 1) // tải lại để hiện khung mới
        } else {
          // thêm vào cơ sở khác với cơ sở đang xem: chuyển sang xem cơ sở đó
          setSelectedId(String(idCoSo))
          setData({})
        }
        setResult({ type: 'success', message: `Đã thêm khung giờ ${s}–${e} (${daysText(days)}) vào ${cur.tenCoSo}.` })
        return null
      } catch (err) {
        return describeApiError(err)
      }
    }

    // Sửa một dòng giá: cập nhật bảng giá của cơ sở rồi lưu (PUT)
    const block = data[String(idCoSo)]
    if (!block) return 'Chưa tải xong bảng giá của cơ sở này.'
    const open = cut5(block.branch.gioMoCua)
    const close = cut5(block.branch.gioDongCua)
    const next = [...block.entries.filter((x) => x.id !== id), { id, ten, time, days, gia }]
    const trung = findClassOverlap(next, id)
    if (trung) return trung
    const message = validatePricing(rowsFromEntries(next), open, close)
    if (message) return message
    try {
      const saved = await putRows(idCoSo, rowsFromEntries(next))
      applyServerRows(idCoSo, saved, next)
      setResult({ type: 'success', message: 'Đã lưu khung giờ vào database.' })
      return null
    } catch (err) {
      return describeApiError(err)
    }
  }

  // Xóa một dòng giá: lưu ngay vào database
  const removeEntry = async (block, item) => {
    if (idKhoa(block.branch.maCoSo)) return setResult({ type: 'error', message: 'Cơ sở đang bị khoá nên không sửa được bảng giá.' })
    const idCoSo = block.branch.maCoSo
    const next = block.entries.filter((x) => x.id !== item.id)
    if (next.length === 0) {
      return setResult({ type: 'error', message: `${block.branch.tenCoSo}: cơ sở cần có ít nhất 1 khung giá, không thể xóa khung cuối cùng.` })
    }
    if (!window.confirm(`Xóa khung giờ ${item.time[0]}–${item.time[1]} (${daysText(item.days)}) của ${block.branch.tenCoSo}? Thay đổi được lưu ngay vào database.`)) return
    const rows = rowsFromEntries(next)
    const message = validatePricing(rows, cut5(block.branch.gioMoCua), cut5(block.branch.gioDongCua))
    if (message) return setResult({ type: 'error', message })
    setSaving(true)
    try {
      const saved = await putRows(idCoSo, rows)
      applyServerRows(idCoSo, saved, next)
      setResult({ type: 'success', message: `Đã xóa khung giờ ${item.time[0]}–${item.time[1]} (${daysText(item.days)}).` })
    } catch (err) {
      setResult({ type: 'error', message: describeApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  // Sửa giờ mở cửa / đóng cửa của một cơ sở: PUT /api/chu-san/co-so/:maCoSo (API có sẵn, nhận đủ thông tin cơ sở)
  // nên gửi lại nguyên thông tin cơ sở, chỉ đổi hai trường giờ. Backend từ chối nếu còn khung giá nằm ngoài giờ mới.
  const saveHours = async () => {
    const { maCoSo: idCoSo, open: newOpen, close: newClose } = hoursDialog
    if (idKhoa(idCoSo)) return setHoursDialog((d) => ({ ...d, error: 'Cơ sở đang bị khoá nên không sửa được giờ mở cửa.' }))
    if (!newOpen || !newClose) return setHoursDialog((d) => ({ ...d, error: 'Vui lòng chọn giờ mở cửa và giờ đóng cửa.' }))
    if (newOpen >= newClose) return setHoursDialog((d) => ({ ...d, error: 'Giờ đóng cửa phải sau giờ mở cửa.' }))
    const full = branches.find((b) => b.maCoSo === idCoSo)
    if (!full) return
    const body = {
      tenCoSo: full.tenCoSo,
      diaChi: full.diaChi,
      tinhThanh: full.tinhThanh,
      quanHuyen: full.quanHuyen,
      soDienThoai: full.soDienThoai,
      linkBanDo: full.linkBanDo,
      gioMoCua: newOpen,
      gioDongCua: newClose,
      soPhutDatToiThieu: Number(full.soPhutDatToiThieu),
    }
    if (full.moTa) body.moTa = full.moTa
    setHoursDialog((d) => ({ ...d, busy: true, error: '' }))
    let prep = { restore: null, reminder: '' }
    try {
      prep = await prepareHoursChange(token, full, newOpen, newClose)
      const updated = await callApi(`/api/chu-san/co-so/${idCoSo}`, { method: 'PUT', token, body })
      setBranches((prev) => prev.map((b) => (b.maCoSo === idCoSo ? { ...b, ...updated } : b)))
      setReloadKey((n) => n + 1) // tải lại bảng giá (có thể đã được cắt cho vừa giờ mới)
      setData((d) => (d[String(idCoSo)] ? { ...d, [String(idCoSo)]: { ...d[String(idCoSo)], branch: { ...d[String(idCoSo)].branch, gioMoCua: newOpen, gioDongCua: newClose } } } : d))
      setHoursDialog(null)
      setResult({ type: prep.reminder ? 'warning' : 'success', message: `Đã lưu giờ mở cửa của ${full.tenCoSo}: ${newOpen}–${newClose}.${prep.reminder ? ` ${prep.reminder}` : ''}` })
    } catch (err) {
      if (prep.restore) await prep.restore()
      setHoursDialog((d) => ({ ...d, busy: false, error: describeApiError(err) }))
    }
  }

  // Sắp xếp trong từng cơ sở: thứ (thứ đầu tiên trước) → khung giờ. Các cơ sở giữ thứ tự cơ sở.
  // Các dòng liền nhau cùng tên sự kiện được gộp chung một ô sự kiện.
  const groupsOf = (entries) => {
    const sorted = [...entries].sort(
      (a, b) => a.days[0] - b.days[0] || a.days.length - b.days.length || toMinutes(a.time[0]) - toMinutes(b.time[0]) || toMinutes(a.time[1]) - toMinutes(b.time[1]),
    )
    const groups = []
    sorted.forEach((it) => {
      const last = groups[groups.length - 1]
      if (last && last.ten === (it.ten || '')) last.items.push(it)
      else groups.push({ ten: it.ten || '', items: [it] })
    })
    return sortRows(groups, pricingCols.filter((c) => c.key !== 'coSo'), sortSel)
  }

  const openEdit = (block, item) =>
    setDialog({
      mode: 'edit',
      ten: item.ten,
      lockName: false,
      defaultBranchId: block.branch.maCoSo,
      initial: { id: item.id, ten: item.ten, time: item.time, days: item.days, gia: String(item.gia) },
    })

  const colCount = showAll ? 6 : 5

  const dsKhoa = branches.filter((b) => isBranchBlocked(b) && (showAll || String(b.maCoSo) === selectedId))
  return (
    <Page>
      {dsKhoa.length > 0 && (
        <Alert type="warning">
          Cơ sở {dsKhoa.map((b) => b.tenCoSo).join(', ')} đang bị khoá: bảng giá được giữ nguyên nhưng không sửa được.
        </Alert>
      )}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={selectedId} onChange={changeBranch} disabled={branches.length === 0}>
            {branches.length === 0 && <option value="">Chưa có cơ sở</option>}
            {branches.length > 0 && <option value={ALL_BRANCHES_ID}>Hiển thị tất cả cơ sở</option>}
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {single && (
          <div className="field-inline">
            <span>Giờ mở cửa: </span>
            <strong>
              {cut5(single.branch.gioMoCua)}–{cut5(single.branch.gioDongCua)}
            </strong>
            {/* Cờ lê: sửa giờ mở cửa / đóng cửa của cơ sở đang chọn */}
            <button
              type="button"
              className="icon-btn icon-btn-wrench"
              title="Sửa giờ mở cửa của cơ sở"
              aria-label="Sửa giờ mở cửa của cơ sở"
              disabled={idKhoa(single.branch.maCoSo)}
              onClick={() => setHoursDialog({ maCoSo: single.branch.maCoSo, open: cut5(single.branch.gioMoCua), close: cut5(single.branch.gioDongCua), error: '', busy: false })}
            >
              <WrenchIcon />
            </button>
          </div>
        )}
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-pricing">
            <thead>
              <tr>
                {showAll && <SortTh cols={pricingCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>}
                <SortTh cols={pricingCols} k="ten" sel={sortSel} onSel={setSortSel}>Tên sự kiện</SortTh>
                <SortTh cols={pricingCols} k="gio" sel={sortSel} onSel={setSortSel}>Khung giờ</SortTh>
                <SortTh cols={pricingCols} k="thu" sel={sortSel} onSel={setSortSel}>Thứ</SortTh>
                <SortTh cols={pricingCols} k="gia" sel={sortSel} onSel={setSortSel}>Giá</SortTh>
                <th className="th-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Đang tải bảng giá...
                  </td>
                </tr>
              )}
              {!loading && branches.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Tài khoản chưa có cơ sở. Hãy thêm cơ sở ở trang Quản lý cơ sở.
                  </td>
                </tr>
              )}
              {!loading &&
                blocks.map((block) => {
                  const groups = groupsOf(block.entries)
                  const total = block.entries.length
                  if (groups.length === 0) {
                    return (
                      <tr key={`empty-${block.branch.maCoSo}`}>
                        {showAll && <td className="event-cell">{block.branch.tenCoSo}</td>}
                        <td colSpan={colCount - (showAll ? 1 : 0)} className="table-empty">
                          Cơ sở chưa có khung giá nào. Bấm &quot;Thêm khung giờ&quot; để tạo.
                        </td>
                      </tr>
                    )
                  }
                  let first = true
                  return groups.map((g) =>
                    g.items.map((it, idx) => {
                      const showBranchCell = showAll && first
                      first = false
                      return (
                        <tr key={`${block.branch.maCoSo}-${it.id}`} className={idx === 0 ? 'group-first' : undefined}>
                          {showBranchCell && (
                            <td rowSpan={total} className="event-cell">
                              <div className="event-name">{block.branch.tenCoSo}</div>
                              <div className="cell-sub">
                                {cut5(block.branch.gioMoCua)}–{cut5(block.branch.gioDongCua)}
                              </div>
                              {/* Cờ lê: sửa giờ mở cửa của cơ sở này */}
                              <button
                                type="button"
                                className="icon-btn icon-btn-wrench"
                                title="Sửa giờ mở cửa của cơ sở"
                                aria-label="Sửa giờ mở cửa của cơ sở"
                                disabled={idKhoa(block.branch.maCoSo)}
                                onClick={() =>
                                  setHoursDialog({ maCoSo: block.branch.maCoSo, open: cut5(block.branch.gioMoCua), close: cut5(block.branch.gioDongCua), error: '', busy: false })
                                }
                              >
                                <WrenchIcon />
                              </button>
                            </td>
                          )}
                          {idx === 0 && (
                            <td rowSpan={g.items.length} className="event-cell">
                              <div className="event-name">{g.ten || <span className="muted">Giờ cố định</span>}</div>
                              {/* Dấu + xanh lá: thêm khung giờ + thứ + giá vào cùng sự kiện */}
                              <button
                                type="button"
                                className="icon-btn icon-btn-plus"
                                title="Thêm khung giờ vào sự kiện này"
                                aria-label="Thêm khung giờ vào sự kiện này"
                                disabled={idKhoa(block.branch.maCoSo)}
                                onClick={() => setDialog({ mode: 'add', ten: g.ten, lockName: true, defaultBranchId: block.branch.maCoSo, initial: { ten: g.ten } })}
                              >
                                <PlusIcon />
                              </button>
                            </td>
                          )}
                          <td>
                            <span className="pill pill-sm">{it.time[0]}</span> - <span className="pill pill-sm">{it.time[1]}</span>
                          </td>
                          <td>{daysText(it.days)}</td>
                          <td>{formatVnd(Number(it.gia))}/giờ</td>
                          <td className="td-center">
                            <div className="row-actions row-actions-center">
                              {/* Cờ lê xanh dương: sửa giá, thứ hoặc thời gian */}
                              <button type="button" className="icon-btn icon-btn-wrench" title="Sửa" aria-label="Sửa" onClick={() => openEdit(block, it)} disabled={saving || idKhoa(block.branch.maCoSo)}>
                                <WrenchIcon />
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeEntry(block, it)} disabled={saving || idKhoa(block.branch.maCoSo)}>
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }),
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="pricing-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => setDialog({ mode: 'add', ten: '', lockName: false, defaultBranchId: showAll ? themDuoc[0]?.maCoSo : Number(selectedId), initial: null })}
            disabled={themDuoc.length === 0 || loading || (!showAll && idKhoa(selectedId))}
          >
            Thêm khung giờ
          </button>
        </div>
      </section>

      {!loading &&
        blocks.map((block) => {
          const gaps = findPriceGaps(rowsFromEntries(block.entries), cut5(block.branch.gioMoCua), cut5(block.branch.gioDongCua))
          return gaps.length > 0 ? (
            <Alert key={`gap-${block.branch.maCoSo}`} type="error">
              {block.branch.tenCoSo}: chưa có giá cho khoảng giờ {gaps.join(', ')}. Khách sẽ không đặt được các khung này.
            </Alert>
          ) : null
        })}
      {result && <Alert type={result.type}>{result.message}</Alert>}

      {hoursDialog && (
        <Dialog
          title={`Giờ mở cửa - ${branches.find((b) => b.maCoSo === hoursDialog.maCoSo)?.tenCoSo ?? ''}`}
          width={460}
          onClose={() => !hoursDialog.busy && setHoursDialog(null)}
        >
          <div className="date-pair">
            <label className="dialog-field">
              <span>Giờ mở cửa:</span>
              <input className="input" type="time" value={hoursDialog.open} onChange={(e) => setHoursDialog((d) => ({ ...d, open: e.target.value, error: '' }))} />
            </label>
            <label className="dialog-field">
              <span>Giờ đóng cửa:</span>
              <input className="input" type="time" value={hoursDialog.close} onChange={(e) => setHoursDialog((d) => ({ ...d, close: e.target.value, error: '' }))} />
            </label>
          </div>
          <p className="picker-hint">Thu hẹp giờ (mở muộn hơn / đóng sớm hơn): các khung giá được tự cắt cho vừa giờ mới. Mở rộng giờ (mở sớm hơn / đóng muộn hơn): giữ nguyên khung giá, bạn cần bổ sung bảng giá cho phần mới và phải khoá tất cả sân của cơ sở trước.</p>
          {hoursDialog.error && <p className="dialog-error">{hoursDialog.error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setHoursDialog(null)} disabled={hoursDialog.busy}>
              Hủy
            </button>
            <button type="button" className="dialog-primary" onClick={saveHours} disabled={hoursDialog.busy}>
              {hoursDialog.busy ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </Dialog>
      )}

      {dialog && (
        <AddPriceDialog
          key={dialog.initial?.id ?? `new-${dialog.ten}-${dialog.defaultBranchId}`}
          branches={themDuoc}
          defaultBranchId={dialog.defaultBranchId}
          mode={dialog.mode}
          initial={dialog.initial}
          lockName={dialog.lockName}
          onSubmit={submitEntry}
          onClose={() => setDialog(null)}
        />
      )}
    </Page>
  )
}

// Phản hồi dài hơn mức này (độ dài phản hồi mẫu đầu tiên) thì chỉ hiện phần đầu kèm nút "Mở rộng"
const REPLY_PREVIEW_LEN = 50

// Cửa sổ phản hồi đánh giá. API có sẵn: PATCH /api/chu-san/danh-gia/:maDanhGia/phan-hoi { noiDung } (ghi đè được phản hồi cũ).
function ReplyDialog({ token, review, onClose, onSaved }) {
  const [text, setText] = useState(review.phanHoiChuSan ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const noiDung = text.trim()
    // Phản hồi là tuỳ chọn: để trống thì chỉ đóng cửa sổ (nếu đang có phản hồi cũ mà xoá trắng thì gỡ phản hồi đó)
    if (!noiDung && !review.phanHoiChuSan) return onClose()
    setBusy(true)
    setError('')
    try {
      if (!noiDung) {
        await callApi(`/api/chu-san/danh-gia/${review.maDanhGia}/phan-hoi`, { method: 'DELETE', token, body: {} })
        return onSaved(review.maDanhGia, null)
      }
      await callApi(`/api/chu-san/danh-gia/${review.maDanhGia}/phan-hoi`, { method: 'PATCH', token, body: { noiDung } })
      onSaved(review.maDanhGia, noiDung)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Phản hồi đánh giá" width={520} onClose={() => !busy && onClose()}>
      <p className="picker-hint">
        {review.tenKhach} · {'★'.repeat(review.soSao)}
        {'☆'.repeat(5 - review.soSao)} · {review.tenCoSo}
      </p>
      <p className="reply-quote">{review.noiDung}</p>
      <label className="dialog-field">
        <span>Phản hồi của chủ sân (không bắt buộc)</span>
        <textarea className="input dlg-textarea" rows={5} placeholder="Nhập phản hồi cho khách..." value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy}>
          {busy ? 'Đang gửi...' : text.trim() ? 'Gửi phản hồi' : review.phanHoiChuSan ? 'Gỡ phản hồi' : 'Xong'}
        </button>
      </div>
    </Dialog>
  )
}

function ReviewsPage({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [stars, setStars] = useState('Tất cả')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [replyTarget, setReplyTarget] = useState(null) // đánh giá đang mở cửa sổ phản hồi
  const [expanded, setExpanded] = useState(new Set()) // các phản hồi dài đang mở rộng
  const tick = useAutoRefresh()

  // API có sẵn GET /api/chu-san/danh-gia?maCoSo=&soSao=&trang=&soLuong=50 (tất cả cơ sở nếu bỏ maCoSo)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        const all = []
        for (let page = 1; page <= 10; page += 1) {
          const loc = branchId === 'all' ? '' : `&maCoSo=${branchId}`
          const data = await callApi(`/api/chu-san/danh-gia?trang=${page}&soLuong=50${loc}`, { token })
          all.push(...(data.cacDanhGia ?? []))
          if ((data.cacDanhGia ?? []).length < 50) break
        }
        if (cancelled) return
        setReviews(all.filter((r) => !r.biAn)) // đánh giá bị quản trị viên ẩn thì không hiển thị
        setError('')
      } catch (err) {
        if (!cancelled) setError(describeApiError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, branchId, tick])

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.soSao, 0) / reviews.length : 0
  const visible = reviews.filter((r) => stars === 'Tất cả' || r.soSao === Number(stars))
  const fmt = (iso) => new Date(iso).toLocaleDateString('vi-VN')
  const reviewCols = [
    { key: 'khach', label: 'Khách hàng', type: 'text', get: (r) => r.tenKhach },
    { key: 'sao', label: 'Đánh giá', type: 'number', get: (r) => r.soSao },
    { key: 'coSo', label: 'Cơ sở', type: 'text', get: (r) => r.tenCoSo },
    { key: 'ngay', label: 'Ngày', type: 'date', get: (r) => r.ngayTao },
  ]

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => { setLoading(true); setBranchId(e.target.value) }}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field-inline">
          <span>Điểm trung bình: </span>
          <strong>{average.toFixed(1)} / 5</strong>
        </div>
        <div className="field-inline">
          <span>Số đánh giá: </span>
          <strong>{reviews.length}</strong>
        </div>
        <label className="field-inline">
          <span>Lọc theo sao: </span>
          <select className="input" value={stars} onChange={(e) => setStars(e.target.value)}>
            <option>Tất cả</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-reviews">
            <thead>
              <tr>
                <SortTh cols={reviewCols} k="khach" sel={sortSel} onSel={setSortSel}>Khách hàng</SortTh>
                <SortTh cols={reviewCols} k="sao" sel={sortSel} onSel={setSortSel}>Đánh giá</SortTh>
                <SortTh cols={reviewCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <th>Bình luận của khách hàng</th>
                <SortTh cols={reviewCols} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
                <th>Phản hồi của chủ sân</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Đang tải đánh giá...
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Chưa có đánh giá nào.
                  </td>
                </tr>
              )}
              {!loading && sortRows(visible, reviewCols, sortSel).map((r) => (
                <tr key={r.maDanhGia}>
                  <td>{r.tenKhach}</td>
                  <td>
                    <span className="stars" aria-label={`${r.soSao} sao`}>
                      {'★'.repeat(r.soSao)}
                      {'☆'.repeat(5 - r.soSao)}
                    </span>
                  </td>
                  <td>{r.tenCoSo}</td>
                  <td>{r.noiDung}</td>
                  <td>{fmt(r.ngayTao)}</td>
                  <td className="reply-cell">
                    {r.phanHoiChuSan ? (
                      <>
                        <span className="reply-text">
                          {expanded.has(r.maDanhGia) || r.phanHoiChuSan.length <= REPLY_PREVIEW_LEN
                            ? r.phanHoiChuSan
                            : `${r.phanHoiChuSan.slice(0, REPLY_PREVIEW_LEN).trimEnd()}…`}
                        </span>
                        <span className="reply-actions">
                          {r.phanHoiChuSan.length > REPLY_PREVIEW_LEN && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(r.maDanhGia)) next.delete(r.maDanhGia)
                                  else next.add(r.maDanhGia)
                                  return next
                                })
                              }
                            >
                              {expanded.has(r.maDanhGia) ? 'Thu gọn' : 'Mở rộng'}
                            </button>
                          )}
                          <button type="button" className="link-btn" onClick={() => setReplyTarget(r)}>
                            Sửa
                          </button>
                        </span>
                      </>
                    ) : (
                      <button type="button" className="btn btn-sm btn-reply" onClick={() => setReplyTarget(r)}>
                        Phản hồi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {replyTarget && (
        <ReplyDialog
          token={token}
          review={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSaved={(maDanhGia, noiDung) => {
            setReviews((prev) => prev.map((r) => (r.maDanhGia === maDanhGia ? { ...r, phanHoiChuSan: noiDung } : r)))
            setReplyTarget(null)
          }}
        />
      )}
    </Page>
  )
}

function RevenuePage({ filters }) {
  const stats = [
    { label: 'Doanh thu', value: '2.840.000đ' },
    { label: 'Lượt đặt', value: '4' },
    { label: 'Tỉ lệ sử dụng', value: '68%' },
  ]

  return (
    <Page title="Báo cáo & phân tích doanh thu">
      <Filters {...filters} />

      <section className="card chart-card chart-card-flat">
        <h2>Xu hướng doanh thu mẫu</h2>
        <BarChart data={WEEKLY} />
      </section>

      <div className="stats stats-3">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="stat-label stat-label-lg">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>
    </Page>
  )
}

// Cửa sổ chi tiết khách: các lượt đặt (ngày, giờ bắt đầu, giờ kết thúc, cơ sở, sân).
// API có sẵn: GET /api/chu-san/bao-cao/khach-hang/chi-tiet?maKhachHang= (hoặc soDienThoai=) &maCoSo=
const DETAIL_SORT_COLS = (nhan) => [
  { key: 'ngay', label: 'Ngày', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'gioBd', label: 'Giờ bắt đầu', type: 'time', get: (d) => cut5(d.gioBatDau) },
  { key: 'gioKt', label: 'Giờ kết thúc', type: 'time', get: (d) => cut5(d.gioKetThuc) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (d) => nhan[d.trangThai] ?? d.trangThai },
]
function CustomerDetailDialog({ token, customer, maCoSo, onClose }) {
  const [sortSel, setSortSel] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const who = customer.maKhachHang ? `maKhachHang=${customer.maKhachHang}` : `soDienThoai=${encodeURIComponent(customer.soDienThoai)}`
    callApi(`/api/chu-san/bao-cao/khach-hang/chi-tiet?${who}${maCoSo === 'all' ? '' : `&maCoSo=${maCoSo}`}&soDong=100`, { token })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, customer, maCoSo])
  const nhan = { confirmed: 'Đã đặt', completed: 'Đã chơi', cancelled: 'Đã huỷ', pending_payment: 'Chờ thanh toán', expired: 'Hết hạn' }
  return (
    <Dialog title={`Chi tiết lượt đặt – ${customer.tenKhach}`} width={760} fit onClose={onClose}>
      <p className="picker-hint">{customer.soDienThoai}</p>
      {error && <p className="dialog-error">{error}</p>}
      {!data && !error && <p className="picker-hint">Đang tải...</p>}
      {data && (
        <>
        <div className="table-scroll dialog-table-scroll">
          <table className="table table-detail">
            <thead>
              <tr>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="gioBd" sel={sortSel} onSel={setSortSel}>Giờ bắt đầu</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="gioKt" sel={sortSel} onSel={setSortSel}>Giờ kết thúc</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortRows(data.cacDon ?? [], DETAIL_SORT_COLS(nhan), sortSel).map((d) => (
                <tr key={d.maDatSan}>
                  <td>{toViDate(String(d.ngay).slice(0, 10))}</td>
                  <td>{cut5(d.gioBatDau)}</td>
                  <td>{cut5(d.gioKetThuc)}</td>
                  <td>{d.tenCoSo}</td>
                  <td>{d.tenSan}</td>
                  <td>{nhan[d.trangThai] ?? d.trangThai}</td>
                </tr>
              ))}
              {(data.cacDon ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Chưa có lượt đặt nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}

const CUSTOMER_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (c) => c.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (c) => c.soDienThoai },
  { key: 'luot', label: 'Số lượt đặt', type: 'number', get: (c) => Number(c.soLuotDat) },
  { key: 'chi', label: 'Tổng chi tiêu', type: 'number', get: (c) => Number(c.tongChiTieu) },
]
function CustomersPage({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [customers, setCustomers] = useState([])
  const [detail, setDetail] = useState(null) // khách đang xem chi tiết
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        // API có sẵn GET /api/chu-san/bao-cao/khach-hang (có lọc maCoSo, tối đa 100 khách mỗi trang)
        const locCoSo = branchId === 'all' ? '' : `&maCoSo=${branchId}`
        const data = await callApi(`/api/chu-san/bao-cao/khach-hang?soDong=100&sapXep=luot-dat${locCoSo}`, { token })
        if (cancelled) return
        setCustomers(data.cacKhach ?? [])
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, branchId, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page subtitle="Khách đã đặt sân và thanh toán tại cơ sở của bạn, xếp theo số lượt đặt nhiều nhất.">
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => { setLoading(true); setBranchId(e.target.value) }}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-customers">
            <thead>
              <tr>
                <SortTh cols={CUSTOMER_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="luot" sel={sortSel} onSel={setSortSel}>Số lượt đặt</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="chi" sel={sortSel} onSel={setSortSel}>Tổng chi tiêu</SortTh>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Đang tải danh sách khách hàng...
                  </td>
                </tr>
              )}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Chưa có khách nào đặt sân tại cơ sở này.
                  </td>
                </tr>
              )}
              {sortRows(customers, CUSTOMER_SORT_COLS, sortSel).map((c, i) => (
                <tr key={`${c.maKhachHang ?? 'vl'}-${c.soDienThoai}-${i}`}>
                  <td>{c.tenKhach}</td>
                  <td>{c.soDienThoai}</td>
                  <td>{c.soLuotDat}</td>
                  <td>{formatVnd(c.tongChiTieu)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(c)}>
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detail && <CustomerDetailDialog token={token} customer={detail} maCoSo={branchId} onClose={() => setDetail(null)} />}
    </Page>
  )
}

function SettingsPage({ cancelHours, setCancelHours }) {
  const [value, setValue] = useState(String(cancelHours))
  const [result, setResult] = useState(null)

  const handleSave = (e) => {
    e.preventDefault()
    const n = Number(value)
    if (value.trim() === '' || Number.isNaN(n) || n < 0) {
      setResult({ type: 'error', message: 'Số giờ phải là số không âm.' })
      return
    }
    setCancelHours(n)
    setResult({ type: 'success', message: `Đã lưu: cho phép hủy trước giờ chơi ${n} giờ.` })
  }

  return (
    <Page title="Cài đặt hệ thống & hủy lịch">
      <form className="card form-card" onSubmit={handleSave}>
        <label className="label" htmlFor="cancel-hours">
          Cho phép hủy trước giờ chơi (giờ)
        </label>
        <input
          id="cancel-hours"
          className="input"
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="field-hint">Lịch đã hoàn tất hoặc đã hủy không thể hủy thêm.</p>
        <button type="submit" className="btn btn-primary btn-lg btn-flush">
          Lưu quy định mẫu
        </button>
      </form>

      <Alert>Tất cả cấu hình và thao tác chỉ tồn tại trong phiên xem hiện tại.</Alert>
      {result && <Alert type={result.type}>{result.message}</Alert>}
    </Page>
  )
}

function Placeholder({ title }) {
  return (
    <Page title={title} subtitle="Màn hình này chưa được xây dựng." />
  )
}

/* ============================================================
   App
   ============================================================ */

// Trang chủ sân (mở bằng nút "Xin chào, ...") — không nằm trong menu
const PROFILE_PAGE = { id: 'profile', label: 'Trang chủ sân' }

// Tải ảnh bìa cơ sở lên (API có sẵn POST /api/chu-san/co-so/anh, multipart, trường tepAnh)
// Gửi multipart (ảnh) tới API có sẵn, trả về phần duLieu
async function postMultipart(token, path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Có lỗi xảy ra, vui lòng thử lại.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}

async function uploadAvatarImage(token, file) {
  const body = new FormData()
  body.append('tepAnh', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/tai-khoan/ca-nhan/anh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Không tải được ảnh lên.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}

async function uploadBranchImage(token, file, maCoSo) {
  const body = new FormData()
  body.append('tepAnh', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/chu-san/co-so/${maCoSo ? `${maCoSo}/` : ''}anh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Không tải được ảnh lên.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}

// Trang chủ sân: avatar chủ sân, thông tin tài khoản và đổi mật khẩu
// API có sẵn: GET /api/tai-khoan/ca-nhan, POST /api/tai-khoan/doi-mat-khau ({ matKhauCu, matKhauMoi })
// Avatar chủ sân: backend không có API/cột lưu avatar (cột NguoiDung.AnhDaiDien đã bị bỏ) nên ảnh chỉ được
// lưu trong trình duyệt này (localStorage), thu nhỏ còn 256×256 trước khi lưu.
const avatarKey = (id) => `avatar-chu-san:${id}`
function loadAvatar(id) {
  try {
    return localStorage.getItem(avatarKey(id))
  } catch {
    return null
  }
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

// Cửa sổ sửa thông tin chủ sân. API có sẵn: PATCH /api/tai-khoan/ca-nhan { hoTen, email, soDienThoai, soDienThoaiPhu },
// POST /api/tai-khoan/ca-nhan/anh (ảnh đại diện, trường tepAnh), PATCH /api/chu-san/ngan-hang { maNganHang, soTaiKhoan, chuTaiKhoan }
// (đổi tài khoản nhận tiền, mọi trạng thái hồ sơ) và PUT /api/chu-san/dang-ky/doanh-nghiep { tenDoanhNghiep }
// (backend chỉ cho sửa khi hồ sơ bị từ chối — hồ sơ đã duyệt thì backend chưa có API đổi tên doanh nghiệp).
function EditProfileDialog({ token, person, owner, onClose, onSaved }) {
  const nganHangHienTai = owner?.thongTinNganHang ?? {}
  const choSuaTenDN = owner?.trangThaiDuyet === 'rejected'
  const [tenDoanhNghiep, setTenDoanhNghiep] = useState(owner?.tenDoanhNghiep ?? '')
  const [maNganHang, setMaNganHang] = useState(nganHangHienTai.maNganHang ?? '')
  const [soTaiKhoan, setSoTaiKhoan] = useState(nganHangHienTai.soTaiKhoan ?? '')
  const [chuTaiKhoan, setChuTaiKhoan] = useState(nganHangHienTai.chuTaiKhoan ?? '')
  const dsNganHang = BANKS.some((b) => b.code === maNganHang) || !maNganHang ? BANKS : [...BANKS, { code: maNganHang, name: nganHangHienTai.tenNganHang ?? maNganHang }]
  const [hoTen, setHoTen] = useState(person.hoTen ?? '')
  const [email, setEmail] = useState(person.email ?? '')
  const [soDienThoai, setSoDienThoai] = useState(person.soDienThoai ?? '')
  const [soDienThoaiPhu, setSoDienThoaiPhu] = useState(person.soDienThoaiPhu ?? '')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) return undefined
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const submit = async () => {
    const ten = hoTen.trim()
    const mail = email.trim().toLowerCase()
    if (!ten) return setError('Vui lòng nhập họ và tên.')
    const loiEmail = getEmailError(mail)
    if (loiEmail) return setError(loiEmail)
    if (!soDienThoai) return setError('Vui lòng nhập số điện thoại.')
    const tenDN = tenDoanhNghiep.trim()
    const doiTenDN = choSuaTenDN && tenDN !== (owner?.tenDoanhNghiep ?? '')
    if (doiTenDN && (tenDN.length < 2 || tenDN.length > 150)) return setError('Tên doanh nghiệp phải từ 2 đến 150 ký tự.')
    const stk = soTaiKhoan.trim()
    const chuTK = chuTaiKhoan.trim()
    const doiNganHang = maNganHang !== (nganHangHienTai.maNganHang ?? '') || stk !== (nganHangHienTai.soTaiKhoan ?? '') || chuTK !== (nganHangHienTai.chuTaiKhoan ?? '')
    if (doiNganHang) {
      if (!maNganHang) return setError('Vui lòng chọn ngân hàng.')
      if (!/^\d{6,20}$/.test(stk)) return setError('Số tài khoản phải gồm 6–20 chữ số.')
      if (chuTK.length < 2) return setError('Vui lòng nhập tên chủ tài khoản (từ 2 ký tự).')
    }
    const body = {}
    if (ten !== (person.hoTen ?? '')) body.hoTen = ten
    if (mail !== (person.email ?? '')) body.email = mail
    if (soDienThoai !== (person.soDienThoai ?? '')) body.soDienThoai = soDienThoai
    if (soDienThoaiPhu !== (person.soDienThoaiPhu ?? '')) body.soDienThoaiPhu = soDienThoaiPhu // để trống = xoá số phụ
    if (Object.keys(body).length === 0 && !file && !doiTenDN && !doiNganHang) return setError('Chưa có thay đổi nào để lưu.')
    setBusy(true)
    setError('')
    try {
      let updated = person
      if (Object.keys(body).length > 0) updated = await callApi('/api/tai-khoan/ca-nhan', { method: 'PATCH', token, body })
      if (file) {
        const saved = await uploadAvatarImage(token, file)
        updated = { ...updated, anhDaiDien: saved.anhDaiDien }
      }
      if (doiTenDN) await callApi('/api/chu-san/dang-ky/doanh-nghiep', { method: 'PUT', token, body: { tenDoanhNghiep: tenDN } })
      if (doiNganHang) await callApi('/api/chu-san/ngan-hang', { method: 'PATCH', token, body: { maNganHang, soTaiKhoan: stk, chuTaiKhoan: chuTK } })
      onSaved(updated)
    } catch (err) {
      setError(describeApiError(err))
      setBusy(false)
    }
  }

  return (
    <Dialog title="Sửa thông tin chủ sân" width={520} onClose={() => !busy && onClose()}>
      <div className="dialog-field">
        <span>Ảnh đại diện</span>
        <div className="avatar-row">
          <div className="avatar-box">
            {preview || person.anhDaiDien ? <img src={preview || fileUrl(person.anhDaiDien)} alt="Ảnh đại diện" /> : <span>Không có ảnh</span>}
          </div>
          <label className="btn btn-ghost btn-sm file-btn">
            {preview || person.anhDaiDien ? 'Đổi ảnh' : 'Thêm ảnh'}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
      <label className="dialog-field">
        <span>Họ và tên</span>
        <input className="input" value={hoTen} maxLength={100} onChange={(e) => setHoTen(e.target.value)} />
      </label>
      <label className="dialog-field">
        <span>Email</span>
        <input className="input" type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="dlg-grid-2">
        <label className="dialog-field">
          <span>Số điện thoại</span>
          <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} value={soDienThoai} onChange={(e) => setSoDienThoai(onlyDigits(e.target.value))} />
        </label>
        <label className="dialog-field">
          <span>Số điện thoại phụ (tuỳ chọn)</span>
          <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} value={soDienThoaiPhu} onChange={(e) => setSoDienThoaiPhu(onlyDigits(e.target.value))} />
        </label>
      </div>
      <label className="dialog-field">
        <span>Tên doanh nghiệp</span>
        <input className="input" value={tenDoanhNghiep} maxLength={150} disabled={!choSuaTenDN || busy} onChange={(e) => setTenDoanhNghiep(e.target.value)} />
        {!choSuaTenDN && <small className="dialog-note">Hồ sơ đã được duyệt: hệ thống hiện chưa cho đổi tên doanh nghiệp.</small>}
      </label>
      <label className="dialog-field">
        <span>Ngân hàng</span>
        <select className="input" value={maNganHang} onChange={(e) => setMaNganHang(e.target.value)}>
          <option value="">Chọn ngân hàng</option>
          {dsNganHang.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} - {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="dlg-grid-2">
        <label className="dialog-field">
          <span>Số tài khoản</span>
          <input className="input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={20} value={soTaiKhoan} onChange={(e) => setSoTaiKhoan(onlyDigits(e.target.value))} />
        </label>
        <label className="dialog-field">
          <span>Chủ tài khoản</span>
          <input className="input" value={chuTaiKhoan} maxLength={100} onChange={(e) => setChuTaiKhoan(e.target.value)} />
        </label>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy}>
          {busy ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </Dialog>
  )
}

function ProfilePage({ user, onUserChange }) {
  const token = user.maTruyCap
  const avatarId = user.maNguoiDung ?? user.email
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [avatar] = useState(() => loadAvatar(avatarId)) // ảnh cũ lưu trên trình duyệt (nếu có) chỉ dùng khi server chưa có ảnh
  const [imageMsg, setImageMsg] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [owner, setOwner] = useState(null) // hồ sơ chủ sân: tên doanh nghiệp + tài khoản nhận tiền (GET /api/chu-san/dang-ky)
  const [ownerTick, setOwnerTick] = useState(0)
  const isOwner = user.vaiTro === 'owner'

  useEffect(() => {
    let cancelled = false
    callApi('/api/tai-khoan/ca-nhan', { token })
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!isOwner) return undefined
    let cancelled = false
    callApi('/api/chu-san/dang-ky', { token })
      .then((data) => {
        if (!cancelled) setOwner(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token, isOwner, ownerTick])

  const person = info ?? user
  const update = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    setResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.current || !form.next || !form.confirm) {
      return setResult({ type: 'error', message: 'Vui lòng nhập đầy đủ thông tin.' })
    }
    if (!isStrongPassword(form.next)) {
      return setResult({ type: 'error', message: PASSWORD_RULE_TEXT })
    }
    if (form.next === form.current) {
      return setResult({ type: 'error', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' })
    }
    if (form.next !== form.confirm) {
      return setResult({ type: 'error', message: 'Mật khẩu xác nhận không khớp.' })
    }
    setBusy(true)
    try {
      await callApi('/api/tai-khoan/doi-mat-khau', {
        method: 'POST',
        token,
        body: { matKhauCu: form.current, matKhauMoi: form.next },
      })
      setForm({ current: '', next: '', confirm: '' })
      setResult({ type: 'success', message: 'Đổi mật khẩu thành công.' })
    } catch (err) {
      setResult({ type: 'error', message: describeApiError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <div className="profile-grid">
      <section className="card profile-card">
        <h2 className="card-title">Thông tin tài khoản</h2>
        {user.vaiTro === 'owner' && (
          <div className="avatar-block">
            {/* Đổi ảnh nằm trong cửa sổ "Sửa thông tin" */}
            <div className="avatar-row">
              <span className="avatar-label">Avatar của chủ sân</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImageMsg(null); setEditOpen(true) }} disabled={!info || (isOwner && !owner)}>
                Sửa thông tin
              </button>
            </div>
            <div className="avatar-box">
              {info?.anhDaiDien || avatar ? <img src={info?.anhDaiDien ? fileUrl(info.anhDaiDien) : avatar} alt="Avatar của chủ sân" /> : <span>Không có ảnh</span>}
            </div>
            {imageMsg && <Alert type={imageMsg.type}>{imageMsg.message}</Alert>}
          </div>
        )}
        <dl className="profile-info">
          <div>
            <dt>Họ và tên</dt>
            <dd>{person.hoTen ?? '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{person.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Số điện thoại</dt>
            <dd>{person.soDienThoai ?? '—'}</dd>
          </div>
          {isOwner && (
            <div>
              <dt>Số điện thoại phụ</dt>
              <dd>{person.soDienThoaiPhu ?? '—'}</dd>
            </div>
          )}
          {isOwner && (
            <>
              <div>
                <dt>Tên doanh nghiệp</dt>
                <dd>{owner?.tenDoanhNghiep || '—'}</dd>
              </div>
              <div>
                <dt>Mã ngân hàng</dt>
                <dd>{owner?.thongTinNganHang?.maNganHang || '—'}</dd>
              </div>
              <div>
                <dt>Số tài khoản</dt>
                <dd>{owner?.thongTinNganHang?.soTaiKhoan || '—'}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <form className="card profile-card" onSubmit={handleSubmit}>
        <h2 className="card-title">Đổi mật khẩu</h2>
        {result && <Alert type={result.type}>{result.message}</Alert>}
        <label className="field-block profile-field">
          <span className="label">Mật khẩu hiện tại</span>
          <input className="input" type="password" autoComplete="current-password" value={form.current} onChange={update('current')} />
        </label>
        <label className="field-block profile-field">
          <span className="label">Mật khẩu mới</span>
          <input className="input" type="password" autoComplete="new-password" value={form.next} onChange={update('next')} />
          <span className="field-hint">{PASSWORD_RULE_TEXT}</span>
        </label>
        <label className="field-block profile-field">
          <span className="label">Xác nhận mật khẩu mới</span>
          <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
        </button>
      </form>
      </div>
      {editOpen && (
        <EditProfileDialog
          token={token}
          person={person}
          owner={owner}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setOwnerTick((n) => n + 1)
            setInfo((prev) => ({ ...(prev ?? user), ...updated }))
            onUserChange?.({ hoTen: updated.hoTen, email: updated.email, soDienThoai: updated.soDienThoai })
            setEditOpen(false)
            setImageMsg({ type: 'success', message: 'Đã lưu thông tin chủ sân.' })
          }}
        />
      )}
    </Page>
  )
}

function AdminApp({ user, onLogout, onUserChange }) {
  useDialogTableCss()
  const [active, setActive] = useState('courts')

  // Bộ lọc dùng chung giữa các trang
  const [date, setDate] = useState(todayISO) // ngày hiện tại theo thời gian thực
  const [branch, setBranch] = useState(ALL_BRANCHES)

  // Dữ liệu dùng chung
  const [courts] = useState(INITIAL_COURTS)
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS)
  const [cancelHours, setCancelHours] = useState(12)

  // Chủ sân chưa có đủ CƠ SỞ + SÂN + BẢNG GIÁ thì các trang còn lại bị làm tối và không bấm được
  // (chỉ dùng Trang chủ sân, Quản lý cơ sở, Quản lý sân, Quản lý bảng giá). API có sẵn: GET /api/chu-san/co-so
  // (mỗi cơ sở có soSan và giaThapNhat). Đủ khi có ít nhất 1 cơ sở có sân và đã có bảng giá.
  const [setupReady, setSetupReady] = useState(null) // null = đang kiểm tra
  const [setupTick, setSetupTick] = useState(0)
  useEffect(() => {
    if (user.vaiTro !== 'owner') return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token: user.maTruyCap })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data ? [data] : []
        const ready = list.some((b) => Number(b.soSan ?? 0) > 0 && b.giaThapNhat != null)
        setSetupReady(ready)
        if (!ready) setActive((cur) => (['branches', 'courts', 'pricing', 'profile'].includes(cur) ? cur : 'branches'))
      })
      .catch(() => {
        if (!cancelled) setSetupReady(true) // không kiểm tra được thì không khoá
      })
    return () => {
      cancelled = true
    }
  }, [user.vaiTro, user.maTruyCap, active, setupTick])
  // Khi đang bị khoá thì kiểm tra lại mỗi 4 giây để tự mở khoá ngay khi chủ sân vừa thêm đủ cơ sở/sân/bảng giá
  useEffect(() => {
    if (setupReady !== false) return undefined
    const id = setInterval(() => setSetupTick((n) => n + 1), 4000)
    return () => clearInterval(id)
  }, [setupReady])
  const setupLocked = user.vaiTro === 'owner' && setupReady === false
  const SETUP_PAGES = ['branches', 'courts', 'pricing', 'profile']
  const isDisabledPage = (id) => setupLocked && !SETUP_PAGES.includes(id)

  const branches = [ALL_BRANCHES, ...new Set(courts.map((c) => c.branch))]
  const filters = { date, setDate, branch, setBranch, branches }
  const current = MENU.find((m) => m.id === active) ?? PROFILE_PAGE

  const renderPage = () => {
    if (isDisabledPage(active)) return <Alert type="warning">Cần có đủ cơ sở, sân và bảng giá của sân thì mới dùng được trang này. Hãy hoàn tất ở Quản lý cơ sở, Quản lý sân và Quản lý bảng giá.</Alert>
    switch (active) {
      case 'profile':
        return <ProfilePage user={user} onUserChange={onUserChange} />
      case 'overview':
        return <Overview user={user} onNavigate={setActive} />
      case 'calendar':
        return <CourtMatrix user={user} />
      case 'qr':
        return <QrCheckin bookings={bookings} setBookings={setBookings} />
      case 'bookings':
        return <BookingsPage user={user} filters={filters} onGoRefunds={() => setActive('refunds')} />
      case 'refunds':
        return <RefundsPage user={user} onNavigate={setActive} />
      case 'complaints':
        return <ComplaintsPage user={user} />
      case 'branches':
        return <BranchesPage user={user} onCreated={() => setSetupTick((n) => n + 1)} />
      case 'courts':
        return <CourtsPage user={user} />
      case 'pricing':
        return <PricingPage user={user} />
      case 'revenue':
        return <RevenuePage filters={filters} />
      case 'reviews':
        return <ReviewsPage user={user} />
      case 'users':
        return <CustomersPage user={user} />
      case 'settings':
        return <SettingsPage cancelHours={cancelHours} setCancelHours={setCancelHours} />
      default:
        return <Placeholder title={current.label} />
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <button
          type="button"
          className={`sidebar-heading sidebar-profile${active === 'profile' ? ' is-active' : ''}`}
          onClick={() => setActive('profile')}
          title="Mở trang chủ sân"
        >
          <NavIcon id="profile" />
          <span>Xin chào, {user.hoTen}</span>
        </button>
        <nav>
          {MENU.map((m) => (
            <button
              key={m.id}
              className={`nav-item${m.id === active ? ' is-active' : ''}${isDisabledPage(m.id) ? ' is-disabled' : ''}`}
              disabled={isDisabledPage(m.id)}
              title={isDisabledPage(m.id) ? 'Cần có cơ sở, sân và bảng giá trước' : undefined}
              onClick={() => setActive(m.id)}
            >
              <NavIcon id={m.id} />
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
        <button className="nav-item nav-logout" onClick={onLogout}>
          <NavIcon id="logout" />
          <span>Đăng xuất</span>
        </button>
      </aside>

      {/* key theo trang để form được reset khi chuyển trang */}
      <main className={`content${active === 'courts' ? ' content-fit' : ''}`} key={active}>
        <PageBanner title={current.label} icon={current.id} right={<NotificationBell user={user} />} />
        {renderPage()}
      </main>
    </div>
  )
}

/* ============================================================
   Kết nối API đăng nhập / đăng ký (web người quản lý)
   - Backend: /api/tai-khoan/dang-nhap-web, /api/tai-khoan/dang-ky-chu-san
   - Đổi địa chỉ backend bằng biến VITE_API_URL (mặc định http://localhost:3000)
   ============================================================ */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')

class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

// Gọi API, trả về phần "duLieu" khi thành công, ném ApiError khi thất bại
async function callApi(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }

  if (!res.ok || !payload?.thanhCong) {
    // Đang đăng nhập mà token hết hạn / không hợp lệ → báo cho App đưa về trang đăng nhập
    if (res.status === 401 && token) window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Có lỗi xảy ra, vui lòng thử lại.', payload?.loi?.chiTiet, payload?.loi?.maLoi)
  }
  return payload.duLieu
}

// GET /api/chu-san/co-so hiện trả về DANH SÁCH cơ sở của chủ sân (backend mới); các trang hiện làm việc với
// cơ sở đầu tiên như trước, nên lấy phần tử đầu (vẫn tương thích nếu backend trả về một đối tượng).
async function fetchCoSo(token) {
  const data = await callApi('/api/chu-san/co-so', { token })
  return Array.isArray(data) ? data[0] ?? null : data
}

// Danh sách cơ sở của chủ sân (API có sẵn GET /api/chu-san/co-so). null = đang tải.
function useBranches(token, isOwner) {
  const [branches, setBranches] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (!cancelled) setBranches(Array.isArray(data) ? data : data ? [data] : [])
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setBranches([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])
  return { branches, error }
}

// Nhớ cơ sở được chọn cuối cùng (Lịch hoạt động) trên trình duyệt này
const LAST_BRANCH_KEY = 'lich-hoat-dong-co-so-cuoi'
const readLastBranch = () => {
  try {
    return localStorage.getItem(LAST_BRANCH_KEY) || ''
  } catch {
    return ''
  }
}
const saveLastBranch = (id) => {
  try {
    localStorage.setItem(LAST_BRANCH_KEY, String(id))
  } catch {
    /* bỏ qua */
  }
}

// Thông báo lỗi chung chung khi đăng nhập sai (không tiết lộ email/tên đăng nhập có tồn tại hay không)
const GENERIC_LOGIN_ERROR = 'Email hoặc mật khẩu không chính xác.'

async function loginApi(email, password) {
  try {
    return await callApi('/api/tai-khoan/dang-nhap-web', {
      method: 'POST',
      body: { email, matKhau: password }, // backend mới đăng nhập bằng trường `email` (không còn tenDangNhap)
    })
  } catch (err) {
    if (err.status === 400 || err.status === 401) throw new ApiError(401, GENERIC_LOGIN_ERROR)
    throw err
  }
}

// Backend mới đăng ký bằng email (không còn tenDangNhap).
async function registerApi(form) {
  return callApi('/api/tai-khoan/dang-ky-chu-san', {
    method: 'POST',
    body: {
      hoTen: form.name,
      soDienThoai: form.phone.replace(/\s/g, ''),
      email: form.email,
      matKhau: form.password,
      tenDoanhNghiep: form.company,
      // API đăng ký chủ sân nhận luôn tài khoản nhận tiền: chỉ gửi mã ngân hàng (VD: VCB), BE tự lấy tên
      maNganHang: form.bankCode,
      soTaiKhoan: form.accountNumber,
      xacNhanMatKhau: form.confirm,
    },
  })
}

// Chủ sân chỉ được vào trang quản trị khi hồ sơ đã được quản trị viên duyệt
function getAccessBlockMessage(nguoiDung) {
  // Trang này chỉ dành cho chủ sân: backend cho cả quản trị viên đăng nhập web nên web phải chặn lại
  if (nguoiDung.vaiTro !== 'owner') return 'Tài khoản này không có quyền truy cập trang chủ sân.'
  if (nguoiDung.trangThaiDuyet === 'approved') return ''
  if (nguoiDung.trangThaiDuyet === 'rejected') {
    return 'Hồ sơ đăng ký của bạn đã bị từ chối. Vui lòng liên hệ quản trị viên.'
  }
  return 'Tài khoản đang ở trạng thái "Chờ duyệt". Bạn chỉ có thể đăng nhập sau khi quản trị viên xác nhận.'
}

// Thông báo lỗi từ API (kèm chi tiết từng trường nếu có)
function describeApiError(err) {
  const first = err.details?.[0]
  return first?.thongBao && first.thongBao !== err.message ? `${err.message}: ${first.thongBao}` : err.message
}

/* ============================================================
   Đăng nhập / Đăng ký
   ============================================================ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Khớp backend: SĐT di động 10 số, đầu số 03/05/07/08/09 (chấp nhận +84 / khoảng trắng, được chuẩn hoá về 0xxxxxxxxx)
const NAME_RE = /^\p{L}[\p{L}\s'.-]*$/u
function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/[^0-9]/g, '')
  if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2)
  if (digits && !digits.startsWith('0')) digits = `0${digits}`
  return digits
}
const isMobilePhone = (raw) => /^0[35789]\d{8}$/.test(normalizePhone(raw))
// Yêu cầu của web: số điện thoại phải bắt đầu bằng số 0 và gồm 10 chữ số (không dùng +84)
// Số điện thoại đăng ký (có tiền tố +84): bắt đầu bằng 0 thì nhập đủ 10 số; bắt đầu bằng số khác thì nhập đủ 9 số
// và hệ thống tự thêm số 0 đứng trước (vd 123456789 → 0123456789). Trả về số 10 chữ số bắt đầu bằng 0, hoặc null.
function parseVnPhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length === 11) digits = digits.slice(2)
  if (!digits) return null
  if (digits.startsWith('0')) return digits.length === 10 ? digits : null
  return digits.length === 9 ? `0${digits}` : null
}

// Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt
// Ô chỉ cho nhập số: bỏ mọi ký tự khác chữ số (kể cả khi dán); decimal=true cho phép thêm dấu '-' và '.'
const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')
const onlyDecimal = (v) => String(v ?? '').replace(/[^0-9.\-]/g, '')

const PASSWORD_MIN = 8
const PASSWORD_MAX = 16
const PASSWORD_RULE_TEXT = `Mật khẩu từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.`

function isStrongPassword(p) {
  return (
    p.length >= PASSWORD_MIN &&
    p.length <= PASSWORD_MAX &&
    !/\s/.test(p) &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /\d/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  )
}

// Khóa tạm khi đăng nhập sai liên tiếp (lưu theo email ở trình duyệt để tải lại trang vẫn còn khóa).
// Đang demo nên khóa 15 giây; khi chạy thật đổi LOCK_SECONDS thành 15 * 60.
const MAX_FAILED_LOGINS = 5
const LOCK_SECONDS = 15
const LOCK_STORAGE_KEY = 'loginLocks'

function readLocks() {
  try {
    return JSON.parse(localStorage.getItem(LOCK_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeLocks(locks) {
  try {
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(locks))
  } catch {
    // bỏ qua nếu trình duyệt không cho lưu
  }
}

// Số giây còn bị khóa của email này (0 = không khóa)
function getLockRemaining(email) {
  const until = readLocks()[email]?.lockedUntil || 0
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}

// Ghi nhận một lần sai; trả về true nếu vừa bị khóa
function recordFailedLogin(email) {
  const locks = readLocks()
  const entry = locks[email] || { count: 0, lockedUntil: 0 }
  entry.count += 1
  let locked = false
  if (entry.count >= MAX_FAILED_LOGINS) {
    entry.count = 0
    entry.lockedUntil = Date.now() + LOCK_SECONDS * 1000
    locked = true
  }
  locks[email] = entry
  writeLocks(locks)
  return locked
}

function clearFailedLogins(email) {
  const locks = readLocks()
  delete locks[email]
  writeLocks(locks)
}

function AuthShell({ title, subtitle, wide = false, children }) {
  return (
    <div className="auth-wrap">
      <div className={`card auth-card${wide ? ' auth-card-wide' : ''}`}>
        <div className="auth-banner" aria-hidden="true">
          <svg viewBox="0 0 440 150" preserveAspectRatio={wide ? 'xMidYMid meet' : 'xMidYMax slice'} xmlns="http://www.w3.org/2000/svg">
            <circle cx="372" cy="38" r="52" fill="rgba(255,255,255,0.10)" />
            <circle cx="60" cy="20" r="34" fill="rgba(255,255,255,0.08)" />
            {/* Sân cầu lông nhìn từ trên xuống */}
            <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2">
              <rect x="70" y="34" width="300" height="116" rx="4" />
              <line x1="220" y1="34" x2="220" y2="150" strokeWidth="3" stroke="rgba(255,255,255,0.85)" />
              <line x1="70" y1="62" x2="370" y2="62" />
              <line x1="70" y1="122" x2="370" y2="122" />
              <line x1="146" y1="34" x2="146" y2="150" />
              <line x1="294" y1="34" x2="294" y2="150" />
            </g>
            {/* Quả cầu */}
            <g transform="translate(300 56) rotate(-28)">
              <path d="M-9 -22 L9 -22 L5 -4 L-5 -4 Z" fill="#fff" opacity="0.95" />
              <circle cx="0" cy="2" r="7" fill="#f6c453" />
            </g>
          </svg>
        </div>
        <div className="auth-body">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

// Email đăng nhập phải đúng dạng _@_._ hoặc _@_._._ (vd: ten@gmail.com, ten@mail.com.vn)
const LOGIN_EMAIL_RE = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+){1,2}$/
function getEmailError(value) {
  const v = value.trim()
  if (!v) return 'Vui lòng nhập email.'
  if (!LOGIN_EMAIL_RE.test(v)) return 'Email chưa đúng dạng (ví dụ: ten@gmail.com hoặc ten@mail.com.vn).'
  return ''
}

function LoginPage({ onLogin, onGoRegister, notice, defaultIdentity }) {
  const [identity, setIdentity] = useState(defaultIdentity || '')
  const [emailError, setEmailError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [lockLeft, setLockLeft] = useState(0)

  const emailKey = identity.trim().toLowerCase()

  // Cập nhật đếm ngược khi email đang nhập bị khóa
  useEffect(() => {
    const tick = () => setLockLeft(emailKey ? getLockRemaining(emailKey) : 0)
    tick()
    const timer = setInterval(tick, 500)
    return () => clearInterval(timer)
  }, [emailKey])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const emailErr = getEmailError(identity)
    if (emailErr) {
      setEmailError(emailErr)
      return
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.')
      return
    }
    if (getLockRemaining(emailKey) > 0) return

    setLoading(true)
    setError('')
    setWarning('')
    try {
      const { nguoiDung, maTruyCap } = await loginApi(emailKey, password)
      clearFailedLogins(emailKey)
      if (nguoiDung.vaiTro !== 'owner') {
        setError('Tài khoản này không có quyền vào trang quản lý của chủ sân.')
        return
      }
      const blocked = getAccessBlockMessage(nguoiDung)
      if (blocked) {
        setWarning(blocked)
        return
      }
      onLogin({ ...nguoiDung, maTruyCap })
    } catch (err) {
      if (err.status === 401 && recordFailedLogin(emailKey)) {
        setLockLeft(getLockRemaining(emailKey))
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đăng nhập" subtitle="Đăng nhập để vào trang quản trị đặt sân.">
      <form onSubmit={handleSubmit} noValidate>
        <label className="field-block auth-field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            placeholder="Nhập Email của bạn"
            autoComplete="username"
            value={identity}
            onChange={(e) => {
              setIdentity(e.target.value)
              if (emailError) setEmailError(getEmailError(e.target.value))
              setError('')
              setWarning('')
            }}
            onBlur={() => setEmailError(getEmailError(identity))}
            aria-invalid={emailError ? 'true' : 'false'}
          />
          {emailError && <span className="field-error">{emailError}</span>}
        </label>
        <label className="field-block auth-field">
          <span className="label">Mật khẩu</span>
          <span className="pw-wrap">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
                setWarning('')
              }}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </span>
        </label>
        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading || lockLeft > 0}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      {notice && <Alert type="success">{notice}</Alert>}
      {warning && <Alert type="warning">{warning}</Alert>}
      {lockLeft > 0 && (
        <Alert type="error">
          Bạn đã nhập sai {MAX_FAILED_LOGINS} lần. Đăng nhập tạm khóa, vui lòng thử lại sau {lockLeft} giây.
        </Alert>
      )}
      {error && <Alert type="error">{error}</Alert>}

      <p className="auth-switch">
        Chưa có tài khoản?{' '}
        <button type="button" className="link-btn" onClick={onGoRegister}>
          Đăng ký
        </button>
      </p>
    </AuthShell>
  )
}

// Ô nhập mật khẩu có nút hiện / ẩn mật khẩu (dùng cho Mật khẩu và Nhập lại mật khẩu)
function PasswordInput({ id, value, onChange, onBlur, placeholder, invalid, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <span className="pw-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}

// Kiểm tra từng ô của form đăng ký (cùng luật với backend). Trả về { tênTrường: thông báo lỗi } chỉ gồm ô đang lỗi.
function validateRegister(form) {
  const errors = {}
  const name = form.name.trim().replace(/\s+/g, ' ')
  if (!name) errors.name = 'Vui lòng nhập họ và tên.'
  else if (name.length < 2) errors.name = 'Họ và tên phải có ít nhất 2 ký tự.'
  else if (name.length > 100) errors.name = 'Họ và tên tối đa 100 ký tự.'
  else if (!NAME_RE.test(name)) errors.name = 'Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.'

  const email = form.email.trim()
  if (email.length > 120) errors.email = 'Email tối đa 120 ký tự.'
  else if (getEmailError(email)) errors.email = getEmailError(email)

  const phone = parseVnPhone(form.phone)
  if (!form.phone.trim()) errors.phone = 'Vui lòng nhập số điện thoại.'
  else if (!phone || !isMobilePhone(phone)) errors.phone = 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.'

  const company = form.company.trim().replace(/\s+/g, ' ')
  if (!company) errors.company = 'Vui lòng nhập tên doanh nghiệp.'
  else if (company.length < 2) errors.company = 'Tên doanh nghiệp tối thiểu 2 ký tự.'
  else if (company.length > 150) errors.company = 'Tên doanh nghiệp tối đa 150 ký tự.'

  if (!BANKS.some((b) => b.code === form.bankCode)) errors.bankCode = 'Vui lòng chọn ngân hàng.'

  const accountNumber = form.accountNumber.replace(/\s/g, '')
  if (!accountNumber) errors.accountNumber = 'Vui lòng nhập số tài khoản.'
  else if (!/^\d{6,20}$/.test(accountNumber)) errors.accountNumber = 'Số tài khoản gồm 6–20 chữ số.'

  if (!form.password) errors.password = 'Vui lòng nhập mật khẩu.'
  else if (!isStrongPassword(form.password)) errors.password = PASSWORD_RULE_TEXT

  if (!form.confirm) errors.confirm = 'Vui lòng nhập lại mật khẩu.'
  else if (form.password !== form.confirm) errors.confirm = 'Mật khẩu nhập lại không khớp.'
  return errors
}

function RegisterPage({ onRegistered, onGoLogin }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', bankCode: '', accountNumber: '', password: '', confirm: '' })
  const [touched, setTouched] = useState({}) // ô đã nhập xong (rời khỏi ô) → bắt đầu hiện lỗi của ô đó
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const errors = validateRegister(form)
  const showError = (key) => (touched[key] || submitted ? errors[key] : '')

  const NUMERIC_FIELDS = ['phone', 'accountNumber'] // ô chỉ nhập được chữ số
  const update = (key) => (e) => {
    const value = NUMERIC_FIELDS.includes(key) ? onlyDigits(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setError('')
  }
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }))

  // Thuộc tính chung của một ô nhập: giá trị, lỗi tức thì, đánh dấu ô lỗi
  const field = (key) => ({
    id: `reg-${key}`,
    value: form[key],
    onChange: update(key),
    onBlur: blur(key),
    'aria-invalid': showError(key) ? true : undefined,
  })
  const errorLine = (key) => showError(key) && <span className="field-error">{showError(key)}</span>

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    const firstInvalid = Object.keys(errors)[0]
    if (firstInvalid) {
      document.getElementById(`reg-${firstInvalid}`)?.focus()
      return
    }

    const name = form.name.trim().replace(/\s+/g, ' ')
    const email = form.email.trim().toLowerCase()
    const phone = parseVnPhone(form.phone)
    const company = form.company.trim().replace(/\s+/g, ' ')
    const accountNumber = form.accountNumber.replace(/\s/g, '')

    setLoading(true)
    setError('')
    try {
      // Tài khoản mới ở trạng thái chờ duyệt: bỏ qua token trả về, bắt buộc đăng nhập lại sau khi được duyệt
      await registerApi({ name, email, phone, company, password: form.password, confirm: form.confirm, bankCode: form.bankCode, accountNumber })
      // API tạo luôn hồ sơ chủ sân (đã gồm tài khoản ngân hàng) ở trạng thái chờ duyệt
      onRegistered({ email, bankError: '' })
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đăng ký" wide>
      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-grid">
          <label className="field-block auth-field">
            <span className="label">Họ và tên</span>
            <input className="input" type="text" placeholder="Nguyễn Văn A" autoComplete="name" {...field('name')} />
            {errorLine('name')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Email</span>
            <input className="input" type="email" placeholder="Nhập Email của bạn" autoComplete="email" {...field('email')} />
            {errorLine('email')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Số điện thoại</span>
            <div className="phone-field">
              <span className="phone-prefix">+84</span>
              <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} placeholder="Vui lòng nhập số điện thoại" autoComplete="tel-national" {...field('phone')} />
            </div>
            {errorLine('phone')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Tên doanh nghiệp</span>
            <input className="input" type="text" placeholder="Công ty TNHH Cầu Lông Thành Công" autoComplete="organization" {...field('company')} />
            {errorLine('company')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Ngân hàng</span>
            <select className="input" {...field('bankCode')}>
              <option value="">Chọn ngân hàng</option>
              {BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
            {errorLine('bankCode')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Số tài khoản</span>
            <input className="input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={20} placeholder="Vui lòng nhập số tài khoản" {...field('accountNumber')} />
            {errorLine('accountNumber')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Mật khẩu</span>
            <PasswordInput placeholder="Nhập mật khẩu" autoComplete="new-password" invalid={!!showError('password')} {...{ id: 'reg-password', value: form.password, onChange: update('password'), onBlur: blur('password') }} />
            {errorLine('password')}
          </label>
          <label className="field-block auth-field">
            <span className="label">Nhập lại mật khẩu</span>
            <PasswordInput placeholder="Nhập lại mật khẩu" autoComplete="new-password" invalid={!!showError('confirm')} {...{ id: 'reg-confirm', value: form.confirm, onChange: update('confirm'), onBlur: blur('confirm') }} />
            {errorLine('confirm')}
          </label>
        </div>
        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
          {loading ? 'Đang đăng ký...' : 'Đăng ký'}
        </button>
      </form>

      {error && <Alert type="error">{error}</Alert>}

      <p className="auth-switch">
        Đã có tài khoản?{' '}
        <button type="button" className="link-btn" onClick={onGoLogin}>
          Đăng nhập
        </button>
      </p>
    </AuthShell>
  )
}

/* ============================================================
   App (mặc định hiện trang đăng nhập)
   ============================================================ */

// Phiên đăng nhập: token của backend (JWT) sống 7 ngày. Lưu trong localStorage nên đóng trang / tải lại trang vẫn
// còn đăng nhập, chỉ thoát khi bấm Đăng xuất, token hết hạn hoặc backend trả 401. Không có thoát do chờ lâu.
// (Backend chưa có API làm mới token, nên token không tự đổi sau 15 phút.)
const SESSION_KEY = 'chu-san-phien-dang-nhap'

function jwtExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).exp * 1000
  } catch {
    return 0
  }
}
function saveSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } catch {
    // bộ nhớ trình duyệt đầy / bị chặn: bỏ qua, vẫn dùng được trong phiên hiện tại
  }
}
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // bỏ qua
  }
}
function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (saved?.maTruyCap && saved.vaiTro === 'owner' && jwtExpiry(saved.maTruyCap) > nowMs()) return saved
  } catch {
    // dữ liệu hỏng: coi như chưa đăng nhập
  }
  clearSession()
  return null
}

function App() {
  const [user, setUser] = useState(loadSession) // { ...nguoiDung, maTruyCap }
  const [view, setView] = useState('login') // 'login' | 'register'
  const [notice, setNotice] = useState('')
  const [lastEmail, setLastEmail] = useState('')
  const [clockReady, setClockReady] = useState(false) // đã đồng bộ giờ máy chủ (hoặc thử xong)

  // Đồng bộ giờ máy chủ khi mở trang rồi cứ 5 phút một lần (API có sẵn GET /api/gio-may-chu)
  useEffect(() => {
    let alive = true
    syncServerClock().finally(() => alive && setClockReady(true))
    const id = setInterval(syncServerClock, 5 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const login = (nguoiDung) => {
    saveSession(nguoiDung)
    setUser(nguoiDung)
  }
  const logout = (message = '') => {
    clearSession()
    setNotice(message)
    setView('login')
    setUser(null)
  }

  // Token hết hạn / bị thu hồi → về trang đăng nhập; tự thoát đúng lúc token hết hạn
  useEffect(() => {
    if (!user) return
    const expired = () => logout('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')
    window.addEventListener('session-expired', expired)
    const timer = setTimeout(expired, Math.max(0, Math.min(jwtExpiry(user.maTruyCap) - nowMs(), 2 ** 31 - 1)))
    return () => {
      window.removeEventListener('session-expired', expired)
      clearTimeout(timer)
    }
  }, [user])

  // Phiên khôi phục sau khi mở lại trang: kiểm tra token còn dùng được (API có sẵn GET /api/tai-khoan/ca-nhan)
  useEffect(() => {
    if (user) callApi('/api/tai-khoan/ca-nhan', { token: user.maTruyCap }).catch(() => {})
    // chỉ chạy một lần khi mở trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cập nhật tên / email hiển thị sau khi chủ sân sửa thông tin cá nhân
  const updateUser = (patch) => {
    const next = { ...user, ...patch }
    saveSession(next)
    setUser(next)
  }

  if (!clockReady) return <p className="clock-sync">Đang đồng bộ giờ máy chủ...</p>

  if (user) return <AdminApp user={user} onLogout={() => logout()} onUserChange={updateUser} />

  if (view === 'register') {
    return (
      <RegisterPage
        onGoLogin={() => {
          setNotice('')
          setView('login')
        }}
        onRegistered={({ email, bankError }) => {
          setLastEmail(email)
          setNotice(
            bankError
              ? `Đã tạo tài khoản nhưng chưa lưu được thông tin ngân hàng (${bankError}).`
              : 'Đăng ký thành công! Tài khoản và thông tin ngân hàng đã được lưu vào hệ thống.',
          )
          setView('login')
        }}
      />
    )
  }

  return (
    <LoginPage
      notice={notice}
      defaultIdentity={lastEmail}
      onGoRegister={() => {
        setNotice('')
        setView('register')
      }}
      onLogin={login}
    />
  )
}

export default App
