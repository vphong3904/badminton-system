import { Fragment, useEffect, useRef, useState } from 'react'
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
  { id: 'reviews', label: 'Đánh giá khách hàng' },
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

// Ngày hiện tại theo giờ máy (YYYY-MM-DD), không dùng UTC để khỏi lệch ngày
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Ngày lệch n ngày so với hôm nay (YYYY-MM-DD) — dùng cho dữ liệu mẫu
function addDaysISO(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
const BOOKING_STATUSES = ['Chờ thanh toán', 'Đã chuyển khoản', 'Đã thanh toán', 'Chờ hoàn tiền', 'Đã huỷ']

// Trạng thái hiển thị = gộp trạng thái đơn (DatSan.TrangThai) và trạng thái thanh toán (ThanhToan.TrangThai) của backend:
//  - pending_payment + pending: khách vừa đặt từ app, chưa chuyển khoản → "Chưa hoàn tiền"
//  - pending_payment + confirming: khách đã gửi ảnh chuyển khoản → "Đã thanh toán" (chờ chủ sân Xác nhận / Huỷ đơn đặt)
//  - confirmed / completed → "Đã xác nhận" (lên Lịch hoạt động)
function layTrangThaiDon(d) {
  // Đơn khách vừa đặt chưa chuyển khoản (pending) và đơn hết hạn không hiển thị ở Quản lý đặt sân (trả về null)
  if (d.trangThai === 'pending_payment') return d.trangThaiThanhToan === 'confirming' ? 'Đã chuyển khoản' : null
  // Chủ sân tạo đơn ở Lịch hoạt động → "Chờ thanh toán" cho đến khi bấm "Thu tiền" thì thành "Đã thanh toán"; đơn của khách (chuyển khoản) → "Đã chuyển khoản"
  if (d.trangThai === 'confirmed' || d.trangThai === 'completed') {
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
function coTheHuyDon(d, now = Date.now()) {
  if (d.trangThai === 'pending_payment') return d.trangThaiThanhToan === 'confirming' && now < mocGioDon(d, d.gioBatDau)
  if (d.trangThai !== 'confirmed') return false
  return d.nguon === 'owner' ? now < mocGioDon(d, d.gioKetThuc) : now < mocGioDon(d, d.gioBatDau)
}
// Huỷ đơn bằng API có sẵn theo loại đơn:
//  - đơn chủ sân tạo: PATCH /dat-san/:maDatSan/huy (không hoàn tiền trong hệ thống)
//  - đơn của khách: POST /dat-san/:maDatSan/huy (hoàn theo API, đơn vào hàng đợi Hoàn tiền); đơn khách vừa gửi ảnh chuyển khoản
//    phải được xác nhận trước thì API huỷ mới nhận.
async function huyDonTheoLoai(token, d, lyDo) {
  if (d.nguon === 'owner') return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'PATCH', token, body: { lyDo } })
  if (d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'confirming') {
    await callApi(`/api/chu-san/dat-san/${d.maDatSan}/xac-nhan-thanh-toan`, { method: 'POST', token })
  }
  return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'POST', token, body: { lyDo } })
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

// Giá (đ/giờ, khách vãng lai) của cơ sở tại một thời điểm theo bảng giá: ngày thường T2–T6, cuối tuần T7–CN
function priceAt(khungGias, thoiDiem) {
  const thu = thoiDiem.getDay()
  const cuoiTuan = thu === 0 || thu === 6
  const phut = thoiDiem.getHours() * 60 + thoiDiem.getMinutes()
  const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && phut < toMinutes(cut5(x.gioKetThuc)))
  if (!k) return null
  return Number(cuoiTuan ? k.giaCuoiTuanKhachVangLai : k.giaNgayThuongKhachVangLai)
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

function BarChart({ data, max = 800, ticks = Y_TICKS, label = 'Biểu đồ doanh thu' }) {
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
                className={`chart-col${i < 2 ? ' tip-left' : ''}${i >= data.length - 2 ? ' tip-right' : ''}`}
                tabIndex={0}
                onMouseLeave={() => setHover(null)}
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
        setMaCoSo((prev) => prev ?? all[0]?.maCoSo ?? null)
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
              <option key={b.maCoSo} value={b.maCoSo}>
                {b.tenCoSo}
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
        <BarChart data={chartData} max={scale.max} ticks={scale.ticks} label={range === 'week' ? 'Biểu đồ doanh thu theo tuần' : 'Biểu đồ doanh thu theo tháng'} />
      </section>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => onNavigate('calendar')}>
          Lịch đặt sân
        </button>
        <button className="btn btn-primary" onClick={() => onNavigate('bookings')}>
          Quản lý đặt sân
        </button>
      </div>
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
    const cuoiTuan = [0, 6].includes(new Date(`${ngay}T00:00:00Z`).getUTCDay())
    let ngayTien = 0
    for (let phut = toMinutes(gioBatDau); phut < toMinutes(gioKetThuc); phut += SLOT_MIN) {
      const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && toMinutes(cut5(x.gioKetThuc)) >= phut + SLOT_MIN)
      if (!k) return null
      const gia = coDinh
        ? cuoiTuan ? k.giaCuoiTuanKhachCoDinh : k.giaNgayThuongKhachCoDinh
        : cuoiTuan ? k.giaCuoiTuanKhachVangLai : k.giaNgayThuongKhachVangLai
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
function LockCourtDialog({ token, courts, branch, defaultCourtId, defaultDate, onClose, onChanged, onGoBookings }) {
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
  const [conflicts, setConflicts] = useState(null) // đơn đang trùng khung giờ định khoá
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

  const resetConflicts = () => setConflicts(null)

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

  // Bước 1: tìm đơn đang trùng khung giờ. Bước 2 (nếu chủ sân đồng ý): huỷ các đơn đó. Bước 3: khoá từng ngày.
  const submit = async (huyDon = false) => {
    const loi = validate()
    if (loi) return setError(loi)
    if (huyDon && !lyDo.trim()) return setError('Cần nhập lý do khoá để thông báo cho khách khi huỷ đơn.')
    setBusy(true)
    setError('')
    try {
      let danhSachDon = conflicts
      if (!huyDon) {
        const data = await callApi(`/api/chu-san/dat-san?maSan=${maSan}&tuNgay=${tuNgay}&denNgay=${denNgay}&soDong=200`, { token })
        const now = Date.now()
        danhSachDon = data.cacDon.filter((d) => {
          const dangGiu =
            d.trangThai === 'confirmed' ||
            (d.trangThai === 'pending_payment' && (!d.hetHanGiuCho || Number.isNaN(Date.parse(d.hetHanGiuCho)) || Date.parse(d.hetHanGiuCho) > now))
          return dangGiu && toMinutes(cut5(d.gioBatDau)) < toMinutes(denGio) && toMinutes(cut5(d.gioKetThuc)) > toMinutes(tuGio)
        })
        if (danhSachDon.length > 0) {
          setConflicts(danhSachDon)
          return
        }
      } else {
        const daHuyLich = new Set()
        for (const d of danhSachDon) {
          if (d.maLichCoDinh && daHuyLich.has(d.maLichCoDinh)) continue // huỷ 1 buổi là huỷ cả lịch cố định
          await huyDonTheoLoai(token, d, lyDo.trim())
          if (d.maLichCoDinh) daHuyLich.add(d.maLichCoDinh)
        }
      }
      let daKhoa = 0
      for (const ngay of eachDay(tuNgay, denNgay)) {
        try {
          await callApi('/api/chu-san/khoa-san', {
            method: 'POST',
            token,
            body: {
              maSan: Number(maSan),
              thoiGianBatDau: `${ngay} ${tuGio}`,
              thoiGianKetThuc: `${ngay} ${denGio}`,
              ...(lyDo.trim() ? { lyDo: lyDo.trim() } : {}),
            },
          })
          daKhoa += 1
        } catch (err) {
          throw new Error(`Đã khoá ${daKhoa}/${soNgay} ngày. Lỗi ở ngày ${toViDate(ngay)}: ${describeApiError(err)}`)
        }
      }
      setConflicts(null)
      setReload((n) => n + 1)
      onChanged(`Đã khoá ${daKhoa} ngày, khung ${tuGio}–${denGio}.${huyDon ? ' Các đơn trùng giờ đã được huỷ và chuyển sang trang Hoàn tiền (nếu khách đã thanh toán).' : ''}`)
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
        <select className="input" value={maSan} onChange={(e) => { setMaSan(e.target.value); resetConflicts() }}>
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
          <ViDateInput value={tuNgay} onChange={(v) => { setTuNgay(v); if (v > denNgay) setDenNgay(v); resetConflicts() }} ariaLabel="Từ ngày" />
        </label>
        <label className="dialog-field">
          <span>Đến ngày</span>
          <ViDateInput value={denNgay} min={tuNgay} onChange={(v) => { setDenNgay(v); resetConflicts() }} ariaLabel="Đến ngày" />
        </label>
        <label className="dialog-field">
          <span>Từ giờ (mỗi ngày)</span>
          <select className="input" value={tuGio} onChange={(e) => { setTuGio(e.target.value); if (toMinutes(e.target.value) >= toMinutes(denGio)) setDenGio(toHHMM(toMinutes(e.target.value) + SLOT_MIN)); resetConflicts() }}>
            {times.slice(0, -1).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="dialog-field">
          <span>Đến giờ (mỗi ngày)</span>
          <select className="input" value={denGio} onChange={(e) => { setDenGio(e.target.value); resetConflicts() }}>
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
        Sẽ khoá <strong>{soNgay || 0} ngày</strong>, mỗi ngày cùng khung {tuGio}–{denGio}. Tối đa {MAX_RANGE_DAYS} ngày mỗi lần. Nếu ngày nào đã có khách đặt trong khung giờ này,
        hệ thống sẽ liệt kê các đơn để bạn quyết định huỷ trước khi khoá.
      </p>

      {conflicts && conflicts.length > 0 && (
        <div className="conflict-box">
          <strong>Có {conflicts.length} đơn đang trùng khung giờ này:</strong>
          <ul>
            {conflicts.map((d) => (
              <li key={d.maDatSan}>
                {toViDate(String(d.ngay).slice(0, 10))} · {cut5(d.gioBatDau)}–{cut5(d.gioKetThuc)} · {d.tenKhach} · {courtName(d.maSan) || d.tenSan}
                {toMinutes(cut5(d.gioBatDau)) >= toMinutes(tuGio) && toMinutes(cut5(d.gioKetThuc)) <= toMinutes(denGio) ? ' — nằm trọn trong khung khoá' : ' — trùng một phần với khung khoá'}
                {d.maLichCoDinh ? ' (lịch cố định: huỷ tất cả buổi chưa chơi)' : ''}
              </li>
            ))}
          </ul>
          <p>
            Các đơn này cũng hiện ở trang Quản lý đặt sân để huỷ + hoàn tiền. Huỷ đơn là huỷ <strong>nguyên đơn</strong> (khách được hoàn theo API); hệ thống chưa hỗ trợ huỷ riêng phần trong hoặc ngoài khung khoá.
          </p>
          {onGoBookings && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onGoBookings}>
              Mở Quản lý đặt sân
            </button>
          )}
        </div>
      )}

      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        {conflicts && conflicts.length > 0 ? (
          <button type="button" className="dialog-danger" onClick={() => submit(true)} disabled={busy}>
            {busy ? 'Đang xử lý...' : 'Huỷ đơn & khoá'}
          </button>
        ) : (
          <button type="button" className="dialog-primary" onClick={() => submit(false)} disabled={busy}>
            {busy ? 'Đang xử lý...' : 'Khoá khung giờ'}
          </button>
        )}
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
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
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
          <input className="input" type="tel" placeholder="VD: 0912345678" value={soDienThoai} onChange={(e) => setSoDienThoai(e.target.value)} />
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

function CourtMatrix({ user, onGoBookings }) {
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
  const branch = branches?.find((b) => String(b.maCoSo) === branchId) ?? branches?.[0] ?? null
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

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput value={date} onChange={(v) => v && setDate(v)} ariaLabel="Chọn ngày" />
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branch ? String(branch.maCoSo) : ''} onChange={(e) => chooseBranch(e.target.value)}>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
          onGoBookings={onGoBookings}
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

const BOOKING_BADGE = {
  'Chờ thanh toán': 'unpaid',
  'Đã chuyển khoản': 'paid',
  'Đã thanh toán': 'ok',
  'Chờ hoàn tiền': 'wait',
  'Đã huỷ': 'no',
}

// Quản lý đặt sân: khách đặt từ app → Chưa thanh toán → khách gửi ảnh chuyển khoản → Đã thanh toán (xem ảnh, Xác nhận / Huỷ đơn đặt)
// → Xác nhận: Đã xác nhận (lên Lịch hoạt động). API có sẵn:
//   GET /api/chu-san/dat-san, GET /api/chu-san/dat-san/:maDatSan (lý do),
//   POST /api/chu-san/dat-san/:maDatSan/xac-nhan-thanh-toan (Xác nhận), POST .../tu-choi-thanh-toan (Huỷ đơn đặt + lý do)
// Giờ hiện tại (ms), tự cập nhật theo chu kỳ để các nút phụ thuộc thời gian tự ẩn
function useNow(ms) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// Cửa sổ "Thu tiền": các đơn chủ sân đã tạo mà chưa thu tiền (vd khách đặt trước qua Zalo). Bấm "Thu tiền" → đơn thành "Đã thanh toán" và lên lịch.
// API có sẵn: GET /api/chu-san/dat-san (lọc đơn của chủ sân chưa thu phía web), PATCH /api/chu-san/dat-san/:maDatSan/da-thu
function CollectMoneyDialog({ token, onClose, onChanged }) {
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
    <Dialog title="Thu tiền" width={820} onClose={onClose}>
      <p className="picker-hint">Các đơn bạn đã tạo và đang chờ thu tiền. Bấm “Thu tiền” khi khách đã trả.</p>
      {error && <p className="dialog-error">{error}</p>}
      <div className="table-scroll" style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Khách</th>
              <th>Số điện thoại</th>
              <th>Sân</th>
              <th>Ngày</th>
              <th>Giờ</th>
              <th>Cơ sở</th>
              <th>Tổng tiền</th>
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
            {(rows ?? []).map((d) => (
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
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState('') // đường dẫn ảnh chuyển khoản đang xem
  const [cancelTarget, setCancelTarget] = useState(null) // đơn đang mở cửa sổ huỷ
  const [cancelReason, setCancelReason] = useState('')
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
    setError('')
  }

  // Huỷ đơn: chọn API theo loại đơn (xem huyDonTheoLoai)
  const submitCancel = async () => {
    const d = cancelTarget
    const lyDo = cancelReason.trim()
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
  const visible = orders
    .map((d) => ({ ...d, hienThi: layTrangThaiDon(d) }))
    .filter((d) => {
      if (!d.hienThi) return false
      if (status !== 'Mọi trạng thái' && d.hienThi !== status) return false
      if (q && !normalize(d.tenKhach ?? '').includes(q) && !normalize(d.tenSan ?? '').includes(q)) return false
      return true
    })
    .sort((a, b) => (allDays ? 0 : a.gioBatDau.localeCompare(b.gioBatDau)))
  const colCount = allDays ? 8 : 7

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
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
          placeholder="Tìm tên khách hoặc sân"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm tên khách hoặc sân"
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
          <table className="table table-bookings">
            <thead>
              <tr>
                <th>Khách</th>
                <th>Sân</th>
                {allDays && <th>Ngày</th>}
                <th>Giờ bắt đầu</th>
                <th>Giờ kết thúc</th>
                <th>Cơ sở</th>
                <th>Trạng thái</th>
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
                      <td>{d.tenSan}</td>
                      {allDays && <td>{toViDate(String(d.ngay).slice(0, 10))}</td>}
                      <td>{d.gioBatDau.slice(0, 5)}</td>
                      <td>{d.gioKetThuc.slice(0, 5)}</td>
                      <td>{d.tenCoSo ?? '—'}</td>
                      <td>
                        <span className={`status-badge status-${BOOKING_BADGE[d.hienThi] ?? 'unpaid'}`}>{d.hienThi}</span>
                      </td>
                      <td>
                        {/* Nút xếp chồng: Xem ảnh – Xác nhận – Huỷ đơn; đơn đã xác nhận / đã thanh toán chỉ còn Huỷ đơn; quá thời gian đơn thì không còn nút */}
                        {(() => {
                          const choXacNhan = d.trangThai === 'pending_payment'
                          const duocHuy = coTheHuyDon(d, nowTick)
                          if (d.hienThi === 'Chờ hoàn tiền') {
                            return (
                              <div className="row-actions row-actions-stack">
                                <button type="button" className="btn btn-sm btn-approve" onClick={() => onGoRefunds?.()}>
                                  Đến trang Hoàn tiền
                                </button>
                              </div>
                            )
                          }
                          if (!choXacNhan && !duocHuy) return null
                          return (
                            <div className="row-actions row-actions-stack">
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
                              {duocHuy && (
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
        <div className="modal-backdrop" onClick={() => setPreview('')}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Ảnh chuyển khoản của khách" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreview('')}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Cửa sổ nhập lý do huỷ đơn */}
      {cancelTarget && (
        <Dialog title="Huỷ đơn" width={460} onClose={() => setCancelTarget(null)}>
          <p className="picker-hint">
            {cancelTarget.tenKhach} · {cancelTarget.tenSan} · {cancelTarget.gioBatDau.slice(0, 5)} – {cancelTarget.gioKetThuc.slice(0, 5)}
          </p>
          <label className="dialog-field">
            <span>Lý do huỷ đơn</span>
            <input className="input" type="text" placeholder="Nhập lý do huỷ đơn (bắt buộc)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus required />
          </label>
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setCancelTarget(null)}>
              Đóng
            </button>
            <button
              type="button"
              className="dialog-danger"
              disabled={busyId === cancelTarget.maDatSan || !cancelReason.trim()}
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
  const [maGD, setMaGD] = useState('')
  const [daChuyen, setDaChuyen] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const openConfirm = (r) => {
    setConfirming(r)
    setMaGD('')
    setDaChuyen(false)
    setDialogError('')
  }

  // Chủ sân chuyển khoản cho khách trước, rồi nhập mã giao dịch (biên lai) và xác nhận.
  // API có sẵn: POST /api/chu-san/hoan-tien/:maThanhToan/hoan-thanh { maGiaoDichHoan } — backend gửi thông báo kèm mã này cho khách.
  const complete = async (e) => {
    e.preventDefault()
    const r = confirming
    const text = maGD.trim()
    if (!text) {
      setDialogError('Vui lòng nhập mã giao dịch (mã biên lai chuyển tiền) để khách đối chiếu.')
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
      await callApi(`/api/chu-san/hoan-tien/${r.maThanhToan}/hoan-thanh`, {
        method: 'POST',
        token,
        body: { maGiaoDichHoan: text },
      })
      setNotice(`Đã ghi nhận hoàn tiền cho ${r.tenKhach}. Khách sẽ nhận thông báo kèm mã giao dịch ${text}.`)
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
          Hãy chuyển khoản cho khách trước, sau đó bấm “Hoàn tiền” và nhập mã giao dịch (biên lai) để khách đối chiếu.
        </p>
      )}

      <section className="card table-card tab-attached">
        <div className="table-scroll">
          <table className="table table-refunds">
            <thead>
              <tr>
                <th>Khách</th>
                <th>Đơn đặt</th>
                <th>Mức hoàn</th>
                <th>Số tiền hoàn</th>
                <th>Tài khoản nhận hoàn tiền</th>
                <th>{tab === 'processing' ? 'Thao tác' : 'Ngày hoàn · mã giao dịch'}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    {tab === 'processing' ? 'Không có yêu cầu hoàn tiền nào đang chờ.' : 'Chưa có khoản hoàn tiền nào.'}
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
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
                      {tab === 'processing' ? (
                        <button type="button" className="btn btn-sm btn-approve" disabled={busyId === r.maThanhToan} onClick={() => openConfirm(r)}>
                          Hoàn tiền
                        </button>
                      ) : (
                        <>
                          {r.ngayHoan ? toViDate(String(r.ngayHoan).slice(0, 10)) : '—'}
                          {r.maGiaoDichHoan && <div className="cell-sub">Mã GD: {r.maGiaoDichHoan}</div>}
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
              <span>Mã giao dịch (mã biên lai chuyển tiền) *</span>
              <input className="input" value={maGD} onChange={(e) => setMaGD(e.target.value)} maxLength={100} placeholder="Nhập mã giao dịch trên biên lai" autoFocus />
            </label>
            <label className="refund-check">
              <input type="checkbox" checked={daChuyen} onChange={(e) => setDaChuyen(e.target.checked)} />
              <span>Tôi đã chuyển khoản đúng số tiền cho khách. Khách sẽ nhận thông báo kèm mã giao dịch này.</span>
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

function PageBanner({ title, icon }) {
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
  closed: { label: 'Tạm đóng', className: 'status-maint', hint: 'Cơ sở đang tạm đóng, khách không đặt được.' },
  locked: { label: 'Bị khoá', className: 'status-maint', hint: 'Cơ sở bị quản trị viên khoá, vui lòng liên hệ quản trị viên.' },
}
const MIN_BOOKING_OPTIONS = [30, 60, 90, 120]
const EMPTY_BRANCH_FORM = {
  tenCoSo: '',
  diaChi: '',
  tinhThanh: '',
  quanHuyen: '',
  soDienThoai: '',
  zalo: '',
  linkBanDo: '',
  moTa: '',
  gioMoCua: '06:00',
  gioDongCua: '22:00',
  soPhutDatToiThieu: '60',
  viDo: '',
  kinhDo: '',
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
  const linkBanDo = text(f.linkBanDo)
  const zalo = text(f.zalo)
  const moTa = String(f.moTa ?? '').trim()
  if (!tenCoSo || !diaChi || !tinhThanh || !quanHuyen || !text(f.soDienThoai) || !linkBanDo) {
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
  try {
    const u = new URL(linkBanDo)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('x')
  } catch {
    return { error: 'Link bản đồ không hợp lệ (bắt đầu bằng https://).' }
  }
  if (linkBanDo.length > 500) return { error: 'Link bản đồ tối đa 500 ký tự.' }
  if (moTa.length > 2000) return { error: 'Mô tả tối đa 2000 ký tự.' }
  if (!f.gioMoCua || !f.gioDongCua) return { error: 'Vui lòng chọn giờ mở cửa và giờ đóng cửa.' }
  if (f.gioMoCua >= f.gioDongCua) return { error: 'Giờ đóng cửa phải sau giờ mở cửa.' }
  const soPhut = Number(f.soPhutDatToiThieu)
  if (!Number.isInteger(soPhut) || soPhut < 30 || soPhut % 30 !== 0) return { error: 'Thời gian đặt tối thiểu phải là bội số của 30 phút.' }

  const body = { tenCoSo, diaChi, tinhThanh, quanHuyen, soDienThoai, linkBanDo, gioMoCua: f.gioMoCua, gioDongCua: f.gioDongCua, soPhutDatToiThieu: soPhut }
  if (zalo) body.zalo = zalo
  if (moTa) body.moTa = moTa
  if (text(f.viDo) !== '') {
    const v = Number(f.viDo)
    if (!Number.isFinite(v) || v < -90 || v > 90) return { error: 'Vĩ độ phải từ -90 đến 90.' }
    body.viDo = v
  }
  if (text(f.kinhDo) !== '') {
    const v = Number(f.kinhDo)
    if (!Number.isFinite(v) || v < -180 || v > 180) return { error: 'Kinh độ phải từ -180 đến 180.' }
    body.kinhDo = v
  }
  return { body }
}

function BranchCard({ b, uploading, onChangeImage }) {
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
        {/* Nút đổi ảnh cơ sở nằm trên phần địa chỉ (API có sẵn POST /api/chu-san/co-so/:maCoSo/anh) */}
        <label className={`btn btn-ghost btn-sm file-btn branch-photo-btn${uploading ? ' is-disabled' : ''}`}>
          {uploading ? 'Đang tải ảnh...' : 'Đổi ảnh cơ sở'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onChangeImage(b, file)
            }}
          />
        </label>
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
  const [uploadingId, setUploadingId] = useState(null) // cơ sở đang tải ảnh
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_BRANCH_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [dialogError, setDialogError] = useState('')
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

  // Đổi ảnh cơ sở: POST /api/chu-san/co-so/:maCoSo/anh (multipart, trường tepAnh)
  const changeImage = async (b, file) => {
    setUploadingId(b.maCoSo)
    setError('')
    setSuccess('')
    try {
      const saved = await uploadBranchImage(token, file, b.maCoSo)
      setBranches((prev) => prev.map((x) => (x.maCoSo === b.maCoSo ? { ...x, duongDanAnh: saved.duongDanAnh } : x)))
      setSuccess(`Đã cập nhật ảnh của ${b.tenCoSo}.`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setUploadingId(null)
    }
  }

  const openDialog = () => {
    setForm(EMPTY_BRANCH_FORM)
    setImageFile(null)
    setDialogError('')
    setDialogOpen(true)
  }
  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDialogError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const { body, error: invalid } = validateBranchForm(form)
    if (invalid) {
      setDialogError(invalid)
      return
    }
    setSaving(true)
    setDialogError('')
    try {
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
              <BranchCard key={b.maCoSo} b={b} uploading={uploadingId === b.maCoSo} onChangeImage={changeImage} />
            ))}
          </div>
        )}
      </section>

      {dialogOpen && (
        <Dialog title="Thêm cơ sở" width={640} onClose={() => !saving && setDialogOpen(false)}>
          <form onSubmit={submit} noValidate>
            <div className="branch-form">
              <label className="dialog-field branch-wide">
                <span>Tên cơ sở *</span>
                <input className="input" value={form.tenCoSo} onChange={update('tenCoSo')} maxLength={150} autoFocus />
              </label>
              <label className="dialog-field branch-wide">
                <span>Địa chỉ *</span>
                <input className="input" value={form.diaChi} onChange={update('diaChi')} maxLength={255} placeholder="Số nhà, đường, phường" />
              </label>
              <label className="dialog-field">
                <span>Tỉnh/Thành *</span>
                <select className="input" value={form.tinhThanh} onChange={(e) => setForm((f) => ({ ...f, tinhThanh: e.target.value, quanHuyen: '' }))}>
                  <option value="">Chọn Tỉnh/Thành</option>
                  {[BRANCH_PROVINCE].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-field">
                <span>Quận/Huyện *</span>
                <select className="input" value={form.quanHuyen} onChange={update('quanHuyen')} disabled={!form.tinhThanh}>
                  <option value="">{form.tinhThanh ? 'Chọn Quận/Huyện' : 'Chọn Tỉnh/Thành trước'}</option>
                  {(form.tinhThanh === BRANCH_PROVINCE ? BRANCH_DISTRICTS : []).map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-field">
                <span>Số điện thoại *</span>
                <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} value={form.soDienThoai} onChange={(e) => setForm((f) => ({ ...f, soDienThoai: onlyDigits(e.target.value) }))} />
              </label>
              <label className="dialog-field">
                <span>Zalo</span>
                <input className="input" inputMode="numeric" pattern="[0-9]*" value={form.zalo} onChange={(e) => setForm((f) => ({ ...f, zalo: onlyDigits(e.target.value) }))} maxLength={30} />
              </label>
              <label className="dialog-field branch-wide">
                <span>Link bản đồ (Google Maps) *</span>
                <input className="input" type="url" value={form.linkBanDo} onChange={update('linkBanDo')} placeholder="https://maps.google.com/..." />
              </label>
              <label className="dialog-field">
                <span>Giờ mở cửa *</span>
                <input className="input" type="time" value={form.gioMoCua} onChange={update('gioMoCua')} />
              </label>
              <label className="dialog-field">
                <span>Giờ đóng cửa *</span>
                <input className="input" type="time" value={form.gioDongCua} onChange={update('gioDongCua')} />
              </label>
              <label className="dialog-field">
                <span>Thời gian đặt tối thiểu *</span>
                <select className="input" value={form.soPhutDatToiThieu} onChange={update('soPhutDatToiThieu')}>
                  {MIN_BOOKING_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} phút
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-field">
                <span>Ảnh cơ sở</span>
                <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </label>
              <label className="dialog-field">
                <span>Vĩ độ (tuỳ chọn)</span>
                <input className="input" inputMode="decimal" value={form.viDo} onChange={(e) => setForm((f) => ({ ...f, viDo: onlyDecimal(e.target.value) }))} placeholder="10.8012" />
              </label>
              <label className="dialog-field">
                <span>Kinh độ (tuỳ chọn)</span>
                <input className="input" inputMode="decimal" value={form.kinhDo} onChange={(e) => setForm((f) => ({ ...f, kinhDo: onlyDecimal(e.target.value) }))} placeholder="106.6399" />
              </label>
              <label className="dialog-field branch-wide">
                <span>Mô tả</span>
                <textarea className="input branch-textarea" rows={3} value={form.moTa} onChange={update('moTa')} maxLength={2000} />
              </label>
            </div>
            <p className="picker-hint">Cơ sở mới ở trạng thái &quot;Chưa hiển thị cho khách&quot; cho tới khi có sân hoạt động và bảng giá.</p>
            {dialogError && <p className="dialog-error">{dialogError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
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
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

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
        const bayGio = new Date()
        const conKhach = new Set(
          (don.cacDon ?? [])
            .filter((d) => {
              if (d.trangThai === 'pending_payment') return true
              if (d.trangThai !== 'confirmed') return false
              return new Date(`${String(d.ngay).slice(0, 10)}T${cut5(d.gioKetThuc)}:00`) > bayGio
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

  // Giá hiện tại của sân = giá của CƠ SỞ chứa sân theo Quản lý bảng giá (thời điểm hiện tại, ngày thường / cuối tuần)
  const priceOf = (court) => {
    const khungGias = giaTheoCoSo[court.maCoSo] ?? []
    const gia = priceAt(khungGias, new Date())
    if (gia != null) return `${formatVnd(gia)}/giờ`
    return khungGias.length > 0 ? 'Ngoài giờ' : '—'
  }

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
    const open = cut5(bg.gioMoCua)
    const close = cut5(bg.gioDongCua)
    const gaps = findPriceGaps((bg.khungGias ?? []).map(toRow), open, close)
    if (gaps.length === 0) return null
    return `Chưa thể mở khoá sân: bảng giá của "${bg.tenCoSo}" chưa phủ hết giờ hoạt động ${open}–${close} (thiếu ${gaps.join(', ')}). Hãy bổ sung ở trang Quản lý bảng giá.`
  }

  const toggleStatus = async (court) => {
    const closing = court.trangThai === 'active'
    setBusyId(court.maSan)
    setError('')
    setSuccess('')
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

  // Xoá sân khỏi database: chỉ khi sân đã đóng và không còn khách đặt
  const deleteCourt = async (court) => {
    if (!window.confirm(`Xoá sân "${court.tenSan}"? Thao tác này không hoàn tác được.`)) return
    setBusyId(court.maSan)
    setError('')
    setSuccess('')
    try {
      await callApi(`/api/chu-san/san/${court.maSan}`, { method: 'DELETE', token, body: {} })
      setCourts((prev) => prev.filter((c) => c.maSan !== court.maSan))
      setSuccess(`Đã xoá ${court.tenSan}.`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const openAddDialog = () => {
    setAddError('')
    setNewName('')
    if (filterId !== 'all') setAddBranchId(filterId) // mặc định chọn cơ sở đang lọc
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
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
              </option>
            ))}
          </select>
        </label>
        {/* Nút mở cửa sổ Thêm sân, nằm cạnh ô chọn cơ sở */}
        <button type="button" className="btn btn-primary" onClick={openAddDialog} disabled={branches.length === 0}>
          <PlusIcon /> Thêm sân
        </button>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-courts">
            <thead>
              <tr>
                <th>Sân</th>
                <th>Cơ sở</th>
                <th>Giá</th>
                <th>Trạng thái</th>
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
              {courts.map((c) => {
                const active = c.trangThai === 'active'
                const conKhach = busyCourts.has(c.maSan)
                const coTheXoa = !active && !conKhach
                let tieuDeXoa = 'Xoá sân khỏi hệ thống'
                if (active) tieuDeXoa = 'Cần khoá sân trước khi xoá'
                else if (conKhach) tieuDeXoa = 'Sân còn khách đã đặt, chưa xoá được'
                return (
                  <tr key={c.maSan}>
                    <td>{c.tenSan}</td>
                    <td>{c.tenCoSo ?? branch?.tenCoSo}</td>
                    <td>{priceOf(c)}</td>
                    <td>
                      <span className={`status-badge ${active ? 'status-ok' : 'status-maint'}`}>{active ? 'Hoạt động' : 'Đã khoá'}</span>
                    </td>
                    <td className="td-center">
                      <div className="row-actions row-actions-center">
                        {/* Ổ khoá: sân hoạt động hiện ổ khoá mở (bấm để khoá sân); sân đã khoá hiện ổ khoá đóng (bấm để mở khoá) */}
                        <button
                          type="button"
                          className={`icon-btn icon-btn-wrench${active ? '' : ' is-on'}`}
                          onClick={() => toggleStatus(c)}
                          disabled={busyId === c.maSan}
                          title={active ? 'Khoá sân' : 'Sân đang khoá — bấm để mở khoá (cần bảng giá phủ hết giờ hoạt động của cơ sở)'}
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
                {branches.map((b) => (
                  <option key={b.maCoSo} value={String(b.maCoSo)}>
                    {b.tenCoSo}
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

// Bảng giá của cơ sở: mỗi dòng là một khung giờ, có 2 mức giá (ngày thường / cuối tuần).
// Backend vẫn lưu 4 mức (vãng lai / cố định): web hiển thị giá vãng lai và khi lưu gửi cùng một giá cho cả hai loại khách.
const PRICE_FIELDS = [
  { key: 'giaNgayThuong', label: 'Ngày thường' },
  { key: 'giaCuoiTuan', label: 'Cuối tuần' },
]
const MAX_PRICE = 10_000_000

const toMinutes = (t) => {
  const [h, m] = String(t).split(':')
  return Number(h) * 60 + Number(m)
}
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const cut5 = (t) => String(t ?? '').slice(0, 5)

function toRow(k) {
  const row = { gioBatDau: cut5(k.gioBatDau), gioKetThuc: cut5(k.gioKetThuc), saved: true } // saved = đã có trong database
  row.giaNgayThuong = k.giaNgayThuongKhachVangLai == null ? '' : String(k.giaNgayThuongKhachVangLai)
  row.giaCuoiTuan = k.giaCuoiTuanKhachVangLai == null ? '' : String(k.giaCuoiTuanKhachVangLai)
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
    for (const { key, label } of PRICE_FIELDS) {
      const v = Number(r[key])
      if (r[key] === '' || !Number.isInteger(v) || v < 0 || v > MAX_PRICE) {
        return `Khung ${r.gioBatDau}–${r.gioKetThuc}: giá "${label}" phải là số nguyên từ 0 đến ${MAX_PRICE.toLocaleString('vi-VN')}.`
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
const dayLong = (n) => DAY_NAMES.find((d) => d.n === n)?.long ?? ''

// Backend chỉ có 2 loại ngày để tính giá: ngày thường (T2–T6) và cuối tuần (T7–CN)
function dayRangeKind(a, b) {
  if (a === 1 && b === 5) return 'weekday'
  if (a === 6 && b === 7) return 'weekend'
  if (a === 1 && b === 7) return 'both'
  return null
}

// Cửa sổ chung (nền mờ + hộp có tiêu đề và nút đóng)
function Dialog({ title, onClose, children, level = 1, width = 480 }) {
  return (
    <div className={`dialog-backdrop dialog-level-${level}`} onClick={onClose}>
      <div className="dialog" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
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
      <button type="button" className="dialog-primary" disabled={!start || !end} onClick={() => onConfirm([start, end])}>
        Chọn
      </button>
    </Dialog>
  )
}

// Chọn thứ: bấm từng thứ một để chọn / bỏ chọn. Backend chỉ lưu giá Ngày thường (T2–T6), Cuối tuần (T7–CN) hoặc cả tuần,
// nên tập thứ đã chọn phải khớp một trong ba nhóm này.
function DayRangeDialog({ initial, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => {
    const set = new Set()
    if (initial) for (let n = initial[0]; n <= initial[1]; n += 1) set.add(n)
    return set
  })
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
    const key = list.join(',')
    if (key === '1,2,3,4,5') return onConfirm([1, 5])
    if (key === '6,7') return onConfirm([6, 7])
    if (key === '1,2,3,4,5,6,7') return onConfirm([1, 7])
    setError('Backend chỉ có giá cho Ngày thường (chọn đủ T2–T6), Cuối tuần (chọn T7 và CN) hoặc cả tuần (chọn đủ 7 thứ). Vui lòng chọn một trong các nhóm này.')
  }

  return (
    <Dialog title="Chọn thứ" level={2} width={480} onClose={onClose}>
      <p className="picker-hint">Bấm từng thứ để chọn hoặc bỏ chọn</p>
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
    </Dialog>
  )
}

const kindToDays = (k) => (k === 'weekday' ? [1, 5] : k === 'weekend' ? [6, 7] : [1, 7])
const kindText = (k) => `${dayLong(kindToDays(k)[0])} - ${dayLong(kindToDays(k)[1])}`
const kindsOverlap = (a, b) => a === 'both' || b === 'both' || a === b

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
  const kind = days ? dayRangeKind(days[0], days[1]) : null

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
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
              Giờ mở cửa của cơ sở: {open}–{close}. Khung giờ không được trùng khung đã có của cùng cơ sở VÀ cùng loại thứ (khác cơ sở, hoặc khác thứ T2–T6 / T7–CN thì được trùng giờ).
            </small>
          )}
        </div>

        <div className="dialog-field">
          <span>Chọn thứ:</span>
          {days ? (
            <button type="button" className="pill-group" onClick={() => setShowDays(true)}>
              <span className="pill">{dayLong(days[0])}</span> - <span className="pill">{dayLong(days[1])}</span>
            </button>
          ) : (
            <button type="button" className="dialog-outline" onClick={() => setShowDays(true)}>
              Chọn thứ
            </button>
          )}
          {(kind === 'weekday' || kind === 'weekend') && (
            <small className="dialog-note">Backend cần giá cho cả ngày thường và cuối tuần: ngày còn lại tạm dùng cùng mức giá này.</small>
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
  const kinds = {}
  entries.forEach((e) => {
    const key = keyOfTime(e.time)
    if (e.ten) names[key] = e.ten
    kinds[key] = [...(kinds[key] ?? []), e.kind]
  })
  try {
    localStorage.setItem(priceMetaKey(maCoSo), JSON.stringify({ entries, names, kinds, dated }))
  } catch {
    // trình duyệt không cho lưu: bỏ qua
  }
}

// Khung giá từ database → các dòng giá (dùng ghi nhớ loại ngày nếu còn khớp với giá)
function entriesFromRows(rows, meta) {
  const out = []
  rows.forEach((r) => {
    const time = [r.gioBatDau, r.gioKetThuc]
    const key = keyOfTime(time)
    const wd = Number(r.giaNgayThuong)
    const we = Number(r.giaCuoiTuan)
    const ten = meta.names?.[key] ?? ''
    let kinds = meta.kinds?.[key]
    const hopLe = Array.isArray(kinds) && kinds.length > 0 && (!kinds.includes('both') || (kinds.length === 1 && wd === we))
    if (!hopLe) kinds = wd === we ? ['both'] : ['weekday', 'weekend']
    kinds.forEach((k) => out.push({ id: `${key}-${k}`, ten, time, kind: k, gia: String(k === 'weekend' ? we : wd) }))
  })
  return out
}

// Các dòng giá → khung giá gửi backend (loại ngày chưa có giá thì tạm lấy cùng mức giá với loại còn lại)
// Các dòng giá → khung giá gửi backend. Backend bắt buộc các khung giờ KHÔNG chồng nhau và mỗi khung có đủ giá ngày thường + cuối tuần,
// nên web cắt trục giờ tại mọi mốc: mỗi đoạn lấy giá ngày thường (dòng T2–T6 hoặc cả tuần) và giá cuối tuần (dòng T7–CN hoặc cả tuần).
// Loại ngày nào chưa có giá trong đoạn đó thì tạm lấy cùng mức giá của loại còn lại; đoạn nào không có dòng giá nào thì để trống.
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
    const phu = (e) => toMinutes(e.time[0]) <= a && b <= toMinutes(e.time[1])
    const wd = entries.find((e) => e.kind !== 'weekend' && phu(e))
    const we = entries.find((e) => e.kind !== 'weekday' && phu(e))
    if (!wd && !we) continue
    const row = { gioBatDau: toHHMM(a), gioKetThuc: toHHMM(b), giaNgayThuong: String((wd ?? we).gia), giaCuoiTuan: String((we ?? wd).gia) }
    const truoc = rows[rows.length - 1]
    // đoạn liền kề cùng giá thì gộp lại
    if (truoc && truoc.gioKetThuc === row.gioBatDau && truoc.giaNgayThuong === row.giaNgayThuong && truoc.giaCuoiTuan === row.giaCuoiTuan) {
      truoc.gioKetThuc = row.gioKetThuc
    } else {
      rows.push(row)
    }
  }
  return rows
}

// Chữ ký của danh sách khung giá (để biết các dòng giá đã lưu trên máy có còn khớp với database không)
function rowsSig(rows) {
  return JSON.stringify(rows.map((r) => [cut5(r.gioBatDau), cut5(r.gioKetThuc), Number(r.giaNgayThuong), Number(r.giaCuoiTuan)]).sort())
}

// Dựng các dòng giá hiển thị từ khung giá backend: còn khớp với bản ghi nhớ trên máy thì dùng lại (giữ đúng khung giờ gốc, tên sự kiện), nếu không thì suy ra từ khung giá
function restoreEntries(rows, meta) {
  if (Array.isArray(meta.entries) && meta.entries.length > 0 && rowsSig(rowsFromEntries(meta.entries)) === rowsSig(rows)) return meta.entries
  return entriesFromRows(rows, meta)
}

// Tìm khung giá MỚI (newId) trùng giờ + trùng thứ với một khung đã có (khác loại thứ thì được trùng giờ)
function findClassOverlap(entries, newId) {
  const moi = entries.find((x) => x.id === newId)
  const tx = (a, b) => kindsOverlap(a.kind, b.kind) && toMinutes(a.time[0]) < toMinutes(b.time[1]) && toMinutes(b.time[0]) < toMinutes(a.time[1])
  const mo = (e) => `${e.time[0]}–${e.time[1]} (${kindText(e.kind)})`
  // 1) Khung vừa chọn (khung mới) so với các khung đã có: báo đúng giờ và thứ của khung mới
  if (moi) {
    const c = entries.find((x) => x !== moi && tx(moi, x))
    if (c) {
      return `Khung giờ mới ${mo(moi)} trùng với khung giờ đã có ${mo(c)} của sự kiện "${c.ten || 'Giờ cố định'}". Hãy đổi sang khoảng thứ khác (T2–T6 hoặc T7–CN) hoặc đổi giờ.`
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
  const blocks = visibleIds.map((id) => data[id]).filter(Boolean) // các cơ sở đang hiển thị (đã tải xong)
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
          giaNgayThuongKhachVangLai: Number(r.giaNgayThuong),
          giaNgayThuongKhachCoDinh: Number(r.giaNgayThuong),
          giaCuoiTuanKhachVangLai: Number(r.giaCuoiTuan),
          giaCuoiTuanKhachCoDinh: Number(r.giaCuoiTuan),
        })),
      },
    })

  // Nút Thêm / Lưu trong cửa sổ: ghi thẳng vào database, trả về thông báo lỗi (hoặc null nếu thành công)
  const submitEntry = async ({ id, maCoSo: idCoSo, ten, time, days, gia }) => {
    const kind = dayRangeKind(days[0], days[1])
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
        const next = [...cu, { id: moiId, ten, time, kind, gia: String(Number(gia)) }]
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
        setResult({ type: 'success', message: `Đã thêm khung giờ ${s}–${e} (${kindText(kind)}) vào ${cur.tenCoSo}.` })
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
    const next = [...block.entries.filter((x) => x.id !== id), { id, ten, time, kind, gia }]
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
    const idCoSo = block.branch.maCoSo
    const next = block.entries.filter((x) => x.id !== item.id)
    if (next.length === 0) {
      return setResult({ type: 'error', message: `${block.branch.tenCoSo}: cơ sở cần có ít nhất 1 khung giá, không thể xóa khung cuối cùng.` })
    }
    if (!window.confirm(`Xóa khung giờ ${item.time[0]}–${item.time[1]} (${kindText(item.kind)}) của ${block.branch.tenCoSo}? Thay đổi được lưu ngay vào database.`)) return
    const rows = rowsFromEntries(next)
    const message = validatePricing(rows, cut5(block.branch.gioMoCua), cut5(block.branch.gioDongCua))
    if (message) return setResult({ type: 'error', message })
    setSaving(true)
    try {
      const saved = await putRows(idCoSo, rows)
      applyServerRows(idCoSo, saved, next)
      setResult({ type: 'success', message: `Đã xóa khung giờ ${item.time[0]}–${item.time[1]} (${kindText(item.kind)}).` })
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
    try {
      const updated = await callApi(`/api/chu-san/co-so/${idCoSo}`, { method: 'PUT', token, body })
      setBranches((prev) => prev.map((b) => (b.maCoSo === idCoSo ? { ...b, ...updated } : b)))
      setData((d) => (d[String(idCoSo)] ? { ...d, [String(idCoSo)]: { ...d[String(idCoSo)], branch: { ...d[String(idCoSo)].branch, gioMoCua: newOpen, gioDongCua: newClose } } } : d))
      setHoursDialog(null)
      setResult({ type: 'success', message: `Đã lưu giờ mở cửa của ${full.tenCoSo}: ${newOpen}–${newClose}.` })
    } catch (err) {
      setHoursDialog((d) => ({ ...d, busy: false, error: describeApiError(err) }))
    }
  }

  // Sắp xếp trong từng cơ sở: thứ (T2–T6 trước, rồi T7–CN) → khung giờ. Các cơ sở giữ thứ tự cơ sở.
  // Các dòng liền nhau cùng tên sự kiện được gộp chung một ô sự kiện.
  const groupsOf = (entries) => {
    const dayKey = (k) => (k === 'weekday' ? 0 : k === 'both' ? 1 : 2)
    const sorted = [...entries].sort(
      (a, b) => dayKey(a.kind) - dayKey(b.kind) || toMinutes(a.time[0]) - toMinutes(b.time[0]) || toMinutes(a.time[1]) - toMinutes(b.time[1]),
    )
    const groups = []
    sorted.forEach((it) => {
      const last = groups[groups.length - 1]
      if (last && last.ten === (it.ten || '')) last.items.push(it)
      else groups.push({ ten: it.ten || '', items: [it] })
    })
    return groups
  }

  const openEdit = (block, item) =>
    setDialog({
      mode: 'edit',
      ten: item.ten,
      lockName: false,
      defaultBranchId: block.branch.maCoSo,
      initial: { id: item.id, ten: item.ten, time: item.time, days: kindToDays(item.kind), gia: String(item.gia) },
    })

  const colCount = showAll ? 6 : 5

  return (
    <Page>
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={selectedId} onChange={changeBranch} disabled={branches.length === 0}>
            {branches.length === 0 && <option value="">Chưa có cơ sở</option>}
            {branches.length > 0 && <option value={ALL_BRANCHES_ID}>Hiển thị tất cả cơ sở</option>}
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
                {showAll && <th>Cơ sở</th>}
                <th>Tên sự kiện</th>
                <th>Khung giờ</th>
                <th>Thứ</th>
                <th>Giá</th>
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
                                onClick={() => setDialog({ mode: 'add', ten: g.ten, lockName: true, defaultBranchId: block.branch.maCoSo, initial: { ten: g.ten } })}
                              >
                                <PlusIcon />
                              </button>
                            </td>
                          )}
                          <td>
                            <span className="pill pill-sm">{it.time[0]}</span> - <span className="pill pill-sm">{it.time[1]}</span>
                          </td>
                          <td>{kindText(it.kind)}</td>
                          <td>{formatVnd(Number(it.gia))}/giờ</td>
                          <td className="td-center">
                            <div className="row-actions row-actions-center">
                              {/* Cờ lê xanh dương: sửa giá, thứ hoặc thời gian */}
                              <button type="button" className="icon-btn icon-btn-wrench" title="Sửa" aria-label="Sửa" onClick={() => openEdit(block, it)} disabled={saving}>
                                <WrenchIcon />
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeEntry(block, it)} disabled={saving}>
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
            onClick={() => setDialog({ mode: 'add', ten: '', lockName: false, defaultBranchId: showAll ? branches[0]?.maCoSo : Number(selectedId), initial: null })}
            disabled={branches.length === 0 || loading}
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
          <p className="picker-hint">Các khung giá phải nằm trong giờ mở cửa mới; nếu còn khung nằm ngoài, hãy sửa hoặc xóa khung đó trước.</p>
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
          branches={branches}
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
    if (!noiDung) return setError('Vui lòng nhập nội dung phản hồi, hoặc bấm Đóng nếu chưa muốn phản hồi.')
    setBusy(true)
    setError('')
    try {
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
          {busy ? 'Đang gửi...' : 'Gửi phản hồi'}
        </button>
      </div>
    </Dialog>
  )
}

function ReviewsPage({ user }) {
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
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
                <th>Khách hàng</th>
                <th>Đánh giá</th>
                <th>Cơ sở</th>
                <th>Bình luận của khách hàng</th>
                <th>Ngày</th>
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
              {!loading && visible.map((r) => (
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
function CustomerDetailDialog({ token, customer, maCoSo, onClose }) {
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
    <Dialog title={`Chi tiết lượt đặt – ${customer.tenKhach}`} width={760} onClose={onClose}>
      <p className="picker-hint">{customer.soDienThoai}</p>
      {error && <p className="dialog-error">{error}</p>}
      {!data && !error && <p className="picker-hint">Đang tải...</p>}
      {data && (
        <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Giờ bắt đầu</th>
                <th>Giờ kết thúc</th>
                <th>Cơ sở</th>
                <th>Sân</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {(data.cacDon ?? []).map((d) => (
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
      )}
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}

function CustomersPage({ user }) {
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
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
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
                <th>Khách</th>
                <th>Số điện thoại</th>
                <th>Số lượt đặt</th>
                <th>Tổng chi tiêu</th>
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
              {customers.map((c, i) => (
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

function ProfilePage({ user }) {
  const token = user.maTruyCap
  const avatarId = user.maNguoiDung ?? user.email
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [avatar, setAvatar] = useState(() => loadAvatar(avatarId))
  const [imageMsg, setImageMsg] = useState(null)
  const isOwner = user.vaiTro === 'owner'
  const [warnings, setWarnings] = useState([]) // lịch sử cảnh cáo (thông báo owner_warning / owner_banned)
  const tick = useAutoRefresh()

  // Chưa có API riêng trả số lần cảnh cáo → lấy từ GET /api/thong-bao (admin xử lý khiếu nại sẽ gửi thông báo cho chủ sân)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        const all = []
        for (let page = 1; page <= 10; page += 1) {
          const data = await callApi(`/api/thong-bao?trang=${page}&soLuong=50`, { token })
          const list = data.cacThongBao ?? []
          all.push(...list)
          if (list.length < 50) break
        }
        if (cancelled) return
        setWarnings(
          all
            .filter((n) => n.loaiThamChieu === 'complaint' && (n.loai === 'owner_warning' || n.loai === 'owner_banned'))
            .sort((a, b) => new Date(b.ngayTao) - new Date(a.ngayTao)),
        )
      } catch {
        /* không tải được thì giữ nguyên */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])
  const warningCount = Math.min(
    MAX_WARNINGS,
    warnings.some((n) => n.loai === 'owner_banned')
      ? MAX_WARNINGS
      : warnings.reduce((max, n) => Math.max(max, describeComplaint(n).warnings ?? 0), warnings.length),
  )

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

  const changeAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageMsg(null)
    if (!file.type.startsWith('image/')) {
      return setImageMsg({ type: 'error', message: 'Vui lòng chọn một tệp ảnh.' })
    }
    try {
      const dataUrl = await resizeToDataUrl(file)
      localStorage.setItem(avatarKey(avatarId), dataUrl)
      setAvatar(dataUrl)
      setImageMsg({ type: 'success', message: 'Đã cập nhật avatar.' })
    } catch (err) {
      setImageMsg({ type: 'error', message: err.message || 'Không lưu được ảnh, vui lòng thử lại.' })
    }
  }

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
            {/* Nhãn và nút thêm ảnh cùng một hàng; ảnh thu nhỏ nằm bên trái */}
            <div className="avatar-row">
              <span className="avatar-label">Avatar của chủ sân</span>
              <label className="btn btn-ghost btn-sm file-btn">
                {avatar ? 'Đổi ảnh' : 'Thêm ảnh'}
                <input type="file" accept="image/*" hidden onChange={changeAvatar} />
              </label>
            </div>
            <div className="avatar-box">{avatar ? <img src={avatar} alt="Avatar của chủ sân" /> : <span>Không có ảnh</span>}</div>
            <span className="field-hint">Ảnh chỉ được lưu trên trình duyệt này.</span>
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
              <dt>Cảnh cáo</dt>
              <dd className={warningCount >= MAX_WARNINGS ? 'warn-count warn-max' : 'warn-count'}>
                {warningCount}/{MAX_WARNINGS}
              </dd>
            </div>
          )}
        </dl>
        {isOwner && <span className="field-hint">Quá {MAX_WARNINGS} lần cảnh cáo, tài khoản và tất cả cơ sở sẽ bị tạm dừng hoạt động.</span>}
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
    </Page>
  )
}

function AdminApp({ user, onLogout }) {
  const [active, setActive] = useState('courts')

  // Bộ lọc dùng chung giữa các trang
  const [date, setDate] = useState(todayISO) // ngày hiện tại theo thời gian thực
  const [branch, setBranch] = useState(ALL_BRANCHES)

  // Dữ liệu dùng chung
  const [courts] = useState(INITIAL_COURTS)
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS)
  const [cancelHours, setCancelHours] = useState(12)

  // Chủ sân CHƯA CÓ cơ sở nào thì chưa có sân và bảng giá nên các trang còn lại bị làm tối và không bấm được
  // (chỉ dùng Quản lý cơ sở, Quản lý sân, Quản lý bảng giá, Trang chủ sân). Có ít nhất 1 cơ sở thì mở toàn bộ.
  // API có sẵn: GET /api/chu-san/co-so. Kiểm tra lại mỗi khi chuyển trang.
  const [hasBranch, setHasBranch] = useState(null) // null = đang kiểm tra
  useEffect(() => {
    if (user.vaiTro !== 'owner') return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token: user.maTruyCap })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data ? [data] : []
        setHasBranch(list.length > 0)
        if (list.length === 0) setActive((cur) => (['branches', 'courts', 'pricing', 'profile'].includes(cur) ? cur : 'branches'))
      })
      .catch(() => {
        if (!cancelled) setHasBranch(true) // không kiểm tra được thì không khoá
      })
    return () => {
      cancelled = true
    }
  }, [user.vaiTro, user.maTruyCap, active])
  const setupLocked = user.vaiTro === 'owner' && hasBranch === false
  const SETUP_PAGES = ['branches', 'courts', 'pricing', 'profile']
  const isDisabledPage = (id) => setupLocked && !SETUP_PAGES.includes(id)

  const branches = [ALL_BRANCHES, ...new Set(courts.map((c) => c.branch))]
  const filters = { date, setDate, branch, setBranch, branches }
  const current = MENU.find((m) => m.id === active) ?? PROFILE_PAGE

  const renderPage = () => {
    if (isDisabledPage(active)) return <Alert type="warning">Hãy tạo cơ sở ở trang Quản lý cơ sở để dùng trang này.</Alert>
    switch (active) {
      case 'profile':
        return <ProfilePage user={user} />
      case 'overview':
        return <Overview user={user} onNavigate={setActive} />
      case 'calendar':
        return <CourtMatrix user={user} onGoBookings={() => setActive('bookings')} />
      case 'qr':
        return <QrCheckin bookings={bookings} setBookings={setBookings} />
      case 'bookings':
        return <BookingsPage user={user} filters={filters} onGoRefunds={() => setActive('refunds')} />
      case 'refunds':
        return <RefundsPage user={user} onNavigate={setActive} />
      case 'complaints':
        return <ComplaintsPage user={user} />
      case 'branches':
        return <BranchesPage user={user} onCreated={() => setHasBranch(true)} />
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
              title={isDisabledPage(m.id) ? 'Cần tạo cơ sở trước' : undefined}
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
        <PageBanner title={current.label} icon={current.id} />
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
  if (nguoiDung.vaiTro !== 'owner' || nguoiDung.trangThaiDuyet === 'approved') return ''
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
    if (saved?.maTruyCap && jwtExpiry(saved.maTruyCap) > Date.now()) return saved
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
    const timer = setTimeout(expired, Math.max(0, Math.min(jwtExpiry(user.maTruyCap) - Date.now(), 2 ** 31 - 1)))
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

  if (user) return <AdminApp user={user} onLogout={() => logout()} />

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
