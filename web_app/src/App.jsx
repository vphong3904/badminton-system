import { Fragment, useEffect, useRef, useState } from 'react'
import './App.css'

/* ============================================================
   Dữ liệu mẫu
   ============================================================ */

const MENU = [
  { id: 'courts', label: 'Quản lý sân' },
  { id: 'bookings', label: 'Quản lý đặt sân' },
  { id: 'refunds', label: 'Hoàn tiền' },
  { id: 'calendar', label: 'Lịch hoạt động' },
  { id: 'pricing', label: 'Quản lý bảng giá' },
  { id: 'reviews', label: 'Đánh giá khách hàng' },
  { id: 'users', label: 'Danh sách khách đặt sân' },
  { id: 'overview', label: 'Dashboard và thống kê' },
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
// Khung giờ của ma trận lịch sân: 06:00 → 22:00, mỗi ô 30 phút (06:00, 06:30, ..., 21:30 = 32 ô); mốc 22:00 là vạch kết thúc
const DAY_START_HOUR = 6
const DAY_END_LABEL = '22:00'
const DAY_HOURS = Array.from({ length: 32 }, (_, i) => {
  const gio = DAY_START_HOUR + Math.floor(i / 2)
  return `${String(gio).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
})
const BOOKING_STATUSES = ['Chưa thanh toán', 'Đã thanh toán', 'Đã xác nhận', 'Đã huỷ', 'Hết hạn']

// Trạng thái hiển thị = gộp trạng thái đơn (DatSan.TrangThai) và trạng thái thanh toán (ThanhToan.TrangThai) của backend:
//  - pending_payment + pending: khách vừa đặt từ app, chưa chuyển khoản → "Chưa thanh toán"
//  - pending_payment + confirming: khách đã gửi ảnh chuyển khoản → "Đã thanh toán" (chờ chủ sân Xác nhận / Huỷ đơn đặt)
//  - confirmed / completed → "Đã xác nhận" (lên Lịch hoạt động)
function layTrangThaiDon(d) {
  if (d.trangThai === 'pending_payment') return d.trangThaiThanhToan === 'confirming' ? 'Đã thanh toán' : 'Chưa thanh toán'
  if (d.trangThai === 'confirmed' || d.trangThai === 'completed') return 'Đã xác nhận'
  if (d.trangThai === 'cancelled') return 'Đã huỷ'
  if (d.trangThai === 'expired') return 'Hết hạn'
  return d.trangThai
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

// Biểu tượng cờ lê và thùng rác (SVG)
const WrenchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
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

function BarChart({ data, max = 800, ticks = Y_TICKS, unit = '' }) {
  return (
    <div className="chart" role="img" aria-label="Biểu đồ doanh thu theo tuần">
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
        <div className="chart-bars">
          {data.map((d) => (
            <div key={d.day} className="chart-col">
              <div className="chart-bar" style={{ '--v': d.value / max }} title={`${d.day}: ${d.value.toLocaleString('vi-VN')}${unit}`} />
              <span className="chart-x">{d.day}</span>
            </div>
          ))}
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

// 7 ngày (Thứ 2 → Chủ nhật) của tuần chứa ngày đã chọn
function weekOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const offset = (new Date(y, m - 1, d).getDay() + 6) % 7 // Thứ 2 = 0
  return WEEK_LABELS.map((label, i) => {
    const dt = new Date(y, m - 1, d - offset + i)
    return { label, iso: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}` }
  })
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
  const [branch, setBranch] = useState(null)
  const [courts, setCourts] = useState([])
  const [revenueByDay, setRevenueByDay] = useState({})
  const [debt, setDebt] = useState(0)
  const [unpaidNew, setUnpaidNew] = useState(0) // tiền các đơn khách đặt từ app nhưng chưa thanh toán
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const [range, setRange] = useState('week') // biểu đồ xem theo tuần hoặc tháng
  const [bookingCount, setBookingCount] = useState(null) // số lịch đặt của ngày đã chọn (null = đang tải)
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        // Dùng các API có sẵn của chủ sân (số liệu lấy trực tiếp từ database)
        const coSo = await fetchCoSo(token)
        const locCoSo = coSo ? `?maCoSo=${coSo.maCoSo}` : '' // doanh thu chỉ tính cơ sở hiện tại
        const [cacSan, doanhThu, congNo, donChuaTra] = await Promise.all([
          callApi('/api/chu-san/san', { token }),
          callApi(`/api/chu-san/bao-cao/doanh-thu${locCoSo}`, { token }),
          callApi('/api/chu-san/bao-cao/cong-no', { token }),
          // Đơn khách đặt qua app nhưng chưa thanh toán: tiền nợ mới = tổng tiền sân (giá × số giờ) của các đơn này
          coSo
            ? callApi(`/api/chu-san/dat-san?maCoSo=${coSo.maCoSo}&trangThai=pending_payment&trangThaiThanhToan=pending&soDong=200`, { token })
            : { cacDon: [] },
        ])
        if (cancelled) return
        const byDay = {}
        doanhThu.theoNgay.forEach((r) => {
          byDay[String(r.ngay).slice(0, 10)] = { revenue: Number(r.doanhThu), count: Number(r.soLuotDat) }
        })
        setBranch(coSo)
        setCourts(cacSan)
        setRevenueByDay(byDay)
        setDebt(Number(congNo.tongNo))
        setUnpaidNew(donChuaTra.cacDon.reduce((sum, d) => sum + Number(d.tongTien), 0))
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
  }, [isOwner, token, tick])

  // Lịch đặt trong ngày: API có sẵn GET /api/chu-san/dat-san?ngay=... (đếm đơn đã thanh toán: confirmed + completed)
  const maCoSo = branch?.maCoSo
  useEffect(() => {
    if (!isOwner || !maCoSo || !date) return
    let cancelled = false
    callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSo}&soDong=200`, { token })
      .then((data) => {
        if (cancelled) return
        const paid = data.cacDon.filter((d) => d.trangThai === 'confirmed' || d.trangThai === 'completed')
        setBookingCount(paid.length)
      })
      .catch((err) => {
        if (!cancelled) {
          setBookingCount(0)
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

  const day = revenueByDay[date] ?? { revenue: 0, count: 0 }
  const show = (v) => (loading ? '...' : v)

  const stats = [
    { label: 'Lịch đặt trong ngày', value: show(bookingCount ?? '...') },
    { label: 'Doanh thu trong ngày', value: show(formatVnd(day.revenue)) },
    { label: 'Sân hoạt động', value: show(courts.filter((c) => c.trangThai === 'active').length) },
    { label: 'Số tiền mà khách hàng chưa thanh toán', value: show(formatVnd(debt + unpaidNew)) },
  ]

  const week = weekOf(date || todayISO())
  const periodDays = range === 'week' ? week : monthOf(date || todayISO())
  const weekly = periodDays.map((w) => ({
    day: w.label,
    value: Math.round((revenueByDay[w.iso]?.revenue ?? 0) / 1000),
    iso: w.iso,
  }))
  const scale = niceScale(Math.max(...weekly.map((w) => w.value)))
  const periodRevenue = periodDays.reduce((sum, w) => sum + (revenueByDay[w.iso]?.revenue ?? 0), 0)
  const periodOrders = periodDays.reduce((sum, w) => sum + (revenueByDay[w.iso]?.count ?? 0), 0)

  return (
    <Page subtitle="">
      {error && <Alert type="error">{error}</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="field-inline">
          <span>Cơ sở hiện tại: </span>
          <strong>{branch?.tenCoSo ?? '—'}</strong>
        </div>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <p className="hint">
        Số tiền khách chưa thanh toán = công nợ cũ <strong>{formatVnd(debt)}</strong> + đơn khách đặt qua app chưa thanh toán <strong>{formatVnd(unpaidNew)}</strong> (tiền sân × số giờ đặt).
      </p>

      <section className="card chart-card">
        <div className="chart-head">
          <h2>
            {range === 'week'
              ? `Doanh thu theo tuần (${toViDate(week[0].iso)} – ${toViDate(week[6].iso)}) · nghìn đồng`
              : `Doanh thu theo tháng ${date.slice(5, 7)}/${date.slice(0, 4)} · nghìn đồng`}
          </h2>
          <div className="actions">
            <button type="button" className={`btn btn-sm ${range === 'week' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('week')}>
              Tuần
            </button>
            <button type="button" className={`btn btn-sm ${range === 'month' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('month')}>
              Tháng
            </button>
          </div>
        </div>
        <p className="hint">
          Tổng doanh thu: <strong>{formatVnd(periodRevenue)}</strong> · Số lượt đặt: <strong>{periodOrders}</strong>
        </p>
        <BarChart data={weekly} max={scale.max} ticks={scale.ticks} unit="k" />
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

// Các ngày trong tháng của ngày đã chọn
function monthOf(dateStr) {
  const [y, m] = dateStr.split('-').map(Number)
  const n = new Date(y, m, 0).getDate()
  return Array.from({ length: n }, (_, i) => ({
    iso: `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    label: String(i + 1),
  }))
}

// Đổi "HH:mm" thành vị trí cột (mỗi cột = 30 phút, cột 0 = 06:00)
function slotIndex(time) {
  const [h, m] = time.split(':').map(Number)
  return (h - DAY_START_HOUR) * 2 + (m >= 30 ? 1 : 0)
}

// Dựng các ô của một sân: đơn đặt từ giờ bắt đầu đến giờ kết thúc (không gồm mốc kết thúc)
// gộp thành MỘT ô vàng; mốc kết thúc vẫn trống để khách khác đặt tiếp từ đó.
function buildCourtCells(courtBookings) {
  const total = DAY_HOURS.length
  const sorted = [...courtBookings].sort((a, b) => slotIndex(a.gioBatDau) - slotIndex(b.gioBatDau))
  const cells = []
  let i = 0
  while (i < total) {
    const dat = sorted.find((b) => {
      const start = Math.max(slotIndex(b.gioBatDau), 0)
      return start === i && slotIndex(b.gioKetThuc) > i
    })
    if (dat) {
      const end = Math.min(slotIndex(dat.gioKetThuc), total)
      cells.push({ key: `dat-${i}`, span: end - i, dat })
      i = end
    } else {
      cells.push({ key: `trong-${i}`, span: 1, dat: null })
      i += 1
    }
  }
  return cells
}

function CourtMatrix({ user }) {
  const [date, setDate] = useState(todayISO) // mặc định là ngày hiện tại
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branch, setBranch] = useState(null) // cơ sở tài khoản đang quản lý
  const [courts, setCourts] = useState([]) // tất cả sân của cơ sở đó
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Đơn đã thanh toán của ngày đang xem (API có sẵn GET /api/chu-san/dat-san): confirmed (đã đặt) và completed (hoàn tất)
  // → vẽ thanh vàng từ giờ bắt đầu đến giờ kết thúc kèm tên khách. Đổi ngày thì tải lại.
  const [donTheoNgay, setDonTheoNgay] = useState([])
  const maCoSoLich = branch?.maCoSo
  useEffect(() => {
    if (!isOwner || !maCoSoLich) return
    let cancelled = false
    callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSoLich}&soDong=200`, { token })
      .then((data) => {
        if (!cancelled) {
          // Ô vàng: đơn đã xác nhận (confirmed/completed). Ô đỏ: đơn đã huỷ sau khi khách đã thanh toán
          setDonTheoNgay(
            data.cacDon.filter(
              (d) => d.trangThai === 'confirmed' || d.trangThai === 'completed' || (d.trangThai === 'cancelled' && d.trangThaiThanhToan === 'success'),
            ),
          )
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSoLich, date, tick])

  const tatCaDon = donTheoNgay.map((d) => ({
    maSan: d.maSan,
    maDon: d.maDatSan,
    tenKhach: d.tenKhach,
    gioBatDau: d.gioBatDau.slice(0, 5),
    gioKetThuc: d.gioKetThuc.slice(0, 5),
    huy: d.trangThai === 'cancelled',
  }))
  // Đơn huỷ trùng giờ với đơn đang giữ sân thì không vẽ (tránh chồng ô)
  const datSanTheoNgay = tatCaDon.filter(
    (d) =>
      !d.huy ||
      !tatCaDon.some((o) => !o.huy && o.maSan === d.maSan && toMinutes(o.gioBatDau) < toMinutes(d.gioKetThuc) && toMinutes(d.gioBatDau) < toMinutes(o.gioKetThuc)),
  )

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
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        const coSo = await fetchCoSo(token)
        const cacSan = coSo ? await callApi('/api/chu-san/san', { token }) : []
        if (cancelled) return
        setBranch(coSo)
        setCourts(cacSan)
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
  }, [isOwner, token, tick])

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

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="field-inline">
          <span>Cơ sở hiện tại: </span>
          <strong>{branch?.tenCoSo ?? '—'}</strong>
        </div>
        {/* Chú thích màu trạng thái */}
        <div className="legend" aria-label="Chú thích màu">
          <span className="legend-item">
            <i className="legend-box legend-free" /> Trống
          </span>
          <span className="legend-item">
            <i className="legend-box legend-booked" /> Đã đặt
          </span>
          <span className="legend-item">
            <i className="legend-box legend-cancelled" /> Đã huỷ
          </span>
        </div>
      </div>

      <section className="card table-card">
        {/* Kéo thanh trượt ngang để xem các khung giờ; cột tên sân đứng yên */}
        <div className="table-scroll matrix-scroll">
          <table className="matrix matrix-wide">
            <thead>
              <tr>
                <th>Sân</th>
                {DAY_HOURS.map((h, i) => (
                  <th key={h} className="time-head">
                    <span className="time-label">{h}</span>
                  </th>
                ))}
                {/* Cột cuối cho mốc 22:00: dải màu nền chạy liên tục đến hết ô này */}
                <th className="time-head time-head-end">
                  <span className="time-label">{DAY_END_LABEL}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={DAY_HOURS.length + 2} className="table-empty">
                    Đang tải danh sách sân...
                  </td>
                </tr>
              )}
              {!loading && courts.length === 0 && (
                <tr>
                  <td colSpan={DAY_HOURS.length + 2} className="table-empty">
                    Cơ sở này chưa có sân nào.
                  </td>
                </tr>
              )}
              {courts.map((c) => (
                <tr key={c.maSan} className={c.trangThai === 'maintenance' ? 'court-closed' : undefined}>
                  <th scope="row">{c.tenSan}</th>
                  {buildCourtCells(datSanTheoNgay.filter((d) => d.maSan === c.maSan)).map((cell) =>
                    cell.dat ? (
                      <td
                        key={cell.key}
                        colSpan={cell.span}
                        className={`slot-cell slot-booked${cell.dat.huy ? ' slot-cancelled' : ''}`}
                        title={`${cell.dat.tenKhach} (${cell.dat.maDon}): ${cell.dat.gioBatDau} – ${cell.dat.gioKetThuc}${cell.dat.huy ? ' — đã huỷ' : ''}`}
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
  'Chưa thanh toán': 'unpaid', // ô xám chữ trắng
  'Đã thanh toán': 'paid', // ô xanh chữ đen
  'Đã xác nhận': 'ok',
  'Đã huỷ': 'no',
  'Hết hạn': 'no',
}

// Quản lý đặt sân: khách đặt từ app → Chưa thanh toán → khách gửi ảnh chuyển khoản → Đã thanh toán (xem ảnh, Xác nhận / Huỷ đơn đặt)
// → Xác nhận: Đã xác nhận (lên Lịch hoạt động). API có sẵn:
//   GET /api/chu-san/dat-san, GET /api/chu-san/dat-san/:maDatSan (lý do),
//   POST /api/chu-san/dat-san/:maDatSan/xac-nhan-thanh-toan (Xác nhận), POST .../tu-choi-thanh-toan (Huỷ đơn đặt + lý do)
function BookingsPage({ user, filters }) {
  const { date, setDate } = filters
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branch, setBranch] = useState(null)
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [reasons, setReasons] = useState({}) // maDatSan → lý do chủ sân đã huỷ/từ chối
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
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
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

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    fetchCoSo(token)
      .then((coSo) => {
        if (!cancelled) {
          setBranch(coSo)
          if (!coSo) setLoading(false)
        }
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
  }, [isOwner, token])

  const maCoSo = branch?.maCoSo
  useEffect(() => {
    if (!isOwner || !maCoSo) return
    let cancelled = false
    // Tải lại theo chu kỳ / sau thao tác thì không hiện "Đang tải" (tránh nhấp nháy)
    const key = `${maCoSo}|${date}|${allDays}`
    const silent = lastKey.current === key
    lastKey.current = key
    if (!silent) setLoading(true)
    const loc = allDays ? '' : `&ngay=${date}`
    callApi(`/api/chu-san/dat-san?maCoSo=${maCoSo}&soDong=200${loc}`, { token })
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
  }, [isOwner, token, maCoSo, date, allDays, reload, tick])

  // Danh sách đơn không trả lý do huỷ → với đơn "chưa thanh toán" lấy chi tiết để biết lý do chủ sân đã nhập
  useEffect(() => {
    const ids = orders
      .filter((d) => d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'pending')
      .slice(0, 50)
      .map((d) => d.maDatSan)
    if (ids.length === 0) {
      setReasons({})
      return
    }
    let cancelled = false
    Promise.all(
      ids.map((id) =>
        callApi(`/api/chu-san/dat-san/${id}`, { token })
          .then((ct) => [id, ct.lyDoTuChoiThanhToan])
          .catch(() => [id, null]),
      ),
    ).then((pairs) => {
      if (!cancelled) setReasons(Object.fromEntries(pairs.filter(([, r]) => r)))
    })
    return () => {
      cancelled = true
    }
  }, [orders, token])

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

  // Huỷ đơn đặt (khách đã thanh toán nhưng chủ sân không nhận): dùng API từ chối thanh toán kèm lý do
  const submitCancel = async () => {
    const d = cancelTarget
    const lyDo = cancelReason.trim()
    if (lyDo.length < 2 || lyDo.length > 255) {
      return setError('Lý do huỷ đơn phải từ 2 đến 255 ký tự.')
    }
    setBusyId(d.maDatSan)
    setError('')
    try {
      await callApi(`/api/chu-san/dat-san/${d.maDatSan}/tu-choi-thanh-toan`, { method: 'POST', token, body: { lyDo } })
      setNotice(`Đã huỷ đơn đặt sân của ${d.tenKhach}.`)
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
    .map((d) => ({ ...d, hienThi: layTrangThaiDon(d), lyDo: reasons[d.maDatSan] }))
    .filter((d) => {
      if (status !== 'Mọi trạng thái' && d.hienThi !== status) return false
      if (q && !normalize(d.tenKhach ?? '').includes(q) && !normalize(d.tenSan ?? '').includes(q)) return false
      return true
    })
    .sort((a, b) => (allDays ? 0 : a.gioBatDau.localeCompare(b.gioBatDau)))
  const colCount = allDays ? 7 : 6

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

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={allDays} />
        </label>
        <label className="field-inline">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} />
          <span>Mọi ngày</span>
        </label>
        <div className="field-inline">
          <span>Cơ sở hiện tại: </span>
          <strong>{branch?.tenCoSo ?? '—'}</strong>
        </div>
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
                      <td>
                        <span className={`status-badge status-${BOOKING_BADGE[d.hienThi] ?? 'unpaid'}`}>{d.hienThi}</span>
                      </td>
                      <td>
                        {d.hienThi === 'Đã thanh toán' && (
                          <div className="row-actions">
                            {d.anhChuyenKhoanUrl && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(fileUrl(d.anhChuyenKhoanUrl))}>
                                Xem ảnh
                              </button>
                            )}
                            <button type="button" className="btn btn-sm btn-approve" disabled={busyId === d.maDatSan} onClick={() => confirmOrder(d)}>
                              Xác nhận
                            </button>
                            <button type="button" className="btn btn-sm btn-reject" disabled={busyId === d.maDatSan} onClick={() => openCancel(d)}>
                              Huỷ đơn đặt
                            </button>
                          </div>
                        )}
                        {d.hienThi === 'Đã xác nhận' && (
                          <div className="row-actions">
                            <button type="button" className="btn btn-sm btn-reject" onClick={() => openCancel(d)}>
                              Huỷ đơn đặt
                            </button>
                          </div>
                        )}
                        {d.hienThi !== 'Đã thanh toán' && d.hienThi !== 'Đã xác nhận' && '—'}
                      </td>
                    </tr>

                    {/* Lý do huỷ hiển thị phía dưới đơn */}
                    {d.hienThi === 'Chưa thanh toán' && d.lyDo && (
                      <tr className="row-note">
                        <td colSpan={colCount}>
                          <span className="reject-reason">Lý do huỷ: {d.lyDo}</span>
                        </td>
                      </tr>
                    )}
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
        <Dialog title="Huỷ đơn đặt" width={460} onClose={() => setCancelTarget(null)}>
          <p className="picker-hint">
            {cancelTarget.tenKhach} · {cancelTarget.tenSan} · {cancelTarget.gioBatDau.slice(0, 5)} – {cancelTarget.gioKetThuc.slice(0, 5)}
          </p>
          <label className="dialog-field">
            <span>Lý do huỷ đơn</span>
            <input className="input" type="text" placeholder="Nhập lý do huỷ đơn" maxLength={255} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          </label>
          {layTrangThaiDon(cancelTarget) === 'Đã xác nhận' ? (
            <p className="dialog-error">
              Chưa huỷ được: backend chưa có API huỷ đơn đã xác nhận (huỷ vì khách không đến được, không hoàn tiền). Cần thêm POST /api/chu-san/dat-san/:maDatSan/huy.
            </p>
          ) : (
            <p className="picker-hint">Đơn sẽ quay về &quot;Chưa thanh toán&quot; kèm lý do (cách backend xử lý), khách có thể gửi lại ảnh chuyển khoản.</p>
          )}
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setCancelTarget(null)}>
              Đóng
            </button>
            <button
              type="button"
              className="dialog-danger"
              disabled={busyId === cancelTarget.maDatSan || layTrangThaiDon(cancelTarget) === 'Đã xác nhận'}
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
function RefundsPage({ user }) {
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

  const complete = async (r) => {
    const maGD = window.prompt(`Đã chuyển khoản hoàn tiền cho ${r.tenKhach}? Nhập mã giao dịch hoàn (có thể bỏ trống):`)
    if (maGD === null) return
    setBusyId(r.maThanhToan)
    setError('')
    try {
      const text = maGD.trim()
      await callApi(`/api/chu-san/hoan-tien/${r.maThanhToan}/hoan-thanh`, {
        method: 'POST',
        token,
        body: text ? { maGiaoDichHoan: text } : {},
      })
      setNotice(`Đã ghi nhận hoàn tiền cho ${r.tenKhach}.`)
      setReload((n) => n + 1)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
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

      <div className="actions">
        <button type="button" className={`btn btn-sm ${tab === 'processing' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('processing')}>
          Chờ hoàn tiền
        </button>
        <button type="button" className={`btn btn-sm ${tab === 'refunded' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('refunded')}>
          Đã hoàn tiền
        </button>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-refunds">
            <thead>
              <tr>
                <th>Khách</th>
                <th>Đơn đặt</th>
                <th>Số tiền hoàn</th>
                <th>Tài khoản nhận hoàn</th>
                <th>{tab === 'processing' ? 'Thao tác' : 'Ngày hoàn'}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
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
                        <button type="button" className="btn btn-sm btn-approve" disabled={busyId === r.maThanhToan} onClick={() => complete(r)}>
                          Đã hoàn tiền
                        </button>
                      ) : (
                        r.ngayHoan ? toViDate(String(r.ngayHoan).slice(0, 10)) : '—'
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  )
}

function PageBanner({ title }) {
  return (
    <div className="page-banner">
      <h1 className="page-banner-title">{title}</h1>
    </div>
  )
}

// TẠM THỜI: API bảng giá hiện chỉ trả giá của cơ sở đầu tiên, nên trang Quản lý sân chỉ hiện cơ sở đầu tiên.
// Khi API hỗ trợ bảng giá theo từng cơ sở, đổi thành true để hiện lại ô lọc "Tất cả cơ sở" và ô chọn cơ sở khi thêm sân.
const SHOW_ALL_BRANCHES = false

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
  const [khungGias, setKhungGias] = useState([]) // bảng giá của cơ sở (để hiển thị giá theo thời điểm hiện tại)
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Danh sách cơ sở của tài khoản (API có sẵn GET /api/chu-san/co-so)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (cancelled) return
        const all = Array.isArray(data) ? data : data ? [data] : []
        const list = SHOW_ALL_BRANCHES ? all : all.slice(0, 1)
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
    const locCoSo = SHOW_ALL_BRANCHES && filterId === 'all' ? '' : `maCoSo=${filterId === 'all' ? branches[0].maCoSo : filterId}`
    async function load() {
      try {
        const [cacSan, dangKy, don] = await Promise.all([
          callApi(`/api/chu-san/san${locCoSo ? `?${locCoSo}` : ''}`, { token }),
          callApi('/api/chu-san/dang-ky', { token }),
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
        setKhungGias(dangKy?.khungGias ?? [])
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

  // Giá hiện tại theo Quản lý bảng giá (thời gian + thứ ngày thường/cuối tuần); backend chưa có giá riêng từng sân
  // Bảng giá API hiện chỉ trả về của cơ sở đầu tiên (cùng cơ sở trang Quản lý bảng giá đang sửa) nên chỉ hiện giá cho sân thuộc cơ sở đó
  const giaHienTai = priceAt(khungGias, new Date())
  const coSoCoGia = branches[0]?.maCoSo
  const priceOf = (court) => {
    if (court.maCoSo !== coSoCoGia) return '—'
    if (giaHienTai != null) return `${formatVnd(giaHienTai)}/giờ`
    return khungGias.length > 0 ? 'Ngoài giờ' : '—'
  }

  const changeFilter = (e) => {
    setFilterId(e.target.value)
    setCourts([])
    setLoading(true)
    setError('')
    setSuccess('')
  }

  // Đóng sân / Mở sân: sân đóng thì khách (app) không đặt được nữa, đơn đã đặt vẫn giữ nguyên
  const toggleStatus = async (court) => {
    const closing = court.trangThai === 'active'
    setBusyId(court.maSan)
    setError('')
    setSuccess('')
    try {
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

  // Thêm sân mới vào cơ sở đã chọn: sân ở trạng thái Hoạt động ngay
  const addCourt = async (e) => {
    e.preventDefault()
    const tenSan = newName.trim()
    setError('')
    setSuccess('')
    if (!tenSan) {
      setError('Vui lòng nhập tên sân.')
      return
    }
    if (!branch) {
      setError('Vui lòng chọn cơ sở.')
      return
    }
    setAdding(true)
    try {
      const created = await callApi('/api/chu-san/san', {
        method: 'POST',
        token,
        body: { maCoSo: branch.maCoSo, tenSan, trangThai: 'active' },
      })
      setCourts((prev) => [...prev, created])
      setNewName('')
      setSuccess(`Đã thêm ${created.tenSan} vào ${branch.tenCoSo}. Sân đã ở trạng thái Hoạt động.`)
      // Sân mới thuộc cơ sở khác với bộ lọc đang xem thì chuyển bộ lọc sang cơ sở đó để thấy ngay
      if (filterId !== 'all' && filterId !== addBranchId) setFilterId(addBranchId)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setAdding(false)
    }
  }


  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* Lọc sân theo cơ sở: mặc định hiển thị tất cả sân của mọi cơ sở */}
      {SHOW_ALL_BRANCHES && (
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={filterId} onChange={changeFilter}>
            <option value="all">Tất cả cơ sở</option>
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)}>
                {b.tenCoSo}
              </option>
            ))}
          </select>
        </label>
      </div>
      )}

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
                if (active) tieuDeXoa = 'Cần đóng sân trước khi xoá'
                else if (conKhach) tieuDeXoa = 'Sân còn khách đã đặt, chưa xoá được'
                return (
                  <tr key={c.maSan}>
                    <td>{c.tenSan}</td>
                    <td>{c.tenCoSo ?? branch?.tenCoSo}</td>
                    <td>{priceOf(c)}</td>
                    <td>
                      <span className={`status-badge ${active ? 'status-ok' : 'status-maint'}`}>{active ? 'Hoạt động' : 'Đã đóng'}</span>
                    </td>
                    <td className="td-center">
                      <div className="row-actions row-actions-center">
                        {/* Cờ lê: Đóng sân (khách không đặt được, đơn đã đặt giữ nguyên) / Mở sân lại */}
                        <button
                          type="button"
                          className={`icon-btn icon-btn-wrench${active ? '' : ' is-on'}`}
                          onClick={() => toggleStatus(c)}
                          disabled={busyId === c.maSan}
                          title={active ? 'Đóng sân' : 'Sân đang đóng — bấm để mở lại'}
                          aria-label={active ? 'Đóng sân' : 'Mở sân'}
                        >
                          <WrenchIcon />
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

      <form className="card form-card form-card-spaced" onSubmit={addCourt}>
        <h2 className="card-title">Thêm sân</h2>
        <div className="add-court-row">
          {SHOW_ALL_BRANCHES && (
          <label className="field-block">
            <span className="label">Cơ sở</span>
            <select className="input" value={addBranchId} onChange={(e) => setAddBranchId(e.target.value)} disabled={branches.length === 0}>
              {branches.length === 0 && <option value="">Chưa có cơ sở</option>}
              {branches.map((b) => (
                <option key={b.maCoSo} value={String(b.maCoSo)}>
                  {b.tenCoSo}
                </option>
              ))}
            </select>
          </label>
          )}
          <label className="field-block">
            <span className="label">Tên sân</span>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary btn-lg" disabled={adding || !branch}>
            {adding ? 'Đang thêm...' : 'Thêm sân'}
          </button>
        </div>
      </form>
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
  const changeStep = () => {
    setStep((v) => (v === 30 ? 60 : 30))
    setStart(null)
    setEnd(null)
  }

  return (
    <Dialog title="Chọn khung giờ" level={2} width={640} onClose={onClose}>
      <div className="picker-step">
        <span>Bước (phút):</span>
        <button type="button" className="step-btn" onClick={changeStep} title="Đổi bước 30 / 60 phút">
          {step} <span aria-hidden="true">⇅</span>
        </button>
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

// Chọn khoảng thứ (T2 … CN)
function DayRangeDialog({ initial, onConfirm, onClose }) {
  const [start, setStart] = useState(initial?.[0] ?? null)
  const [end, setEnd] = useState(initial?.[1] ?? null)
  const [error, setError] = useState('')

  const pick = (n) => {
    setError('')
    if (start === null || end !== null) {
      setStart(n)
      setEnd(null)
    } else if (n >= start) {
      setEnd(n)
    } else {
      setStart(n)
    }
  }
  const confirm = () => {
    if (start === null || end === null) return setError('Vui lòng chọn ngày bắt đầu và ngày kết thúc.')
    if (!dayRangeKind(start, end)) {
      return setError('Backend chỉ có giá cho Ngày thường (T2–T6), Cuối tuần (T7–CN) hoặc cả tuần (T2–CN). Vui lòng chọn một trong các khoảng này.')
    }
    onConfirm([start, end])
  }

  return (
    <Dialog title="Chọn khoảng thứ" level={2} width={480} onClose={onClose}>
      <p className="picker-hint">Vui lòng chọn ngày bắt đầu - kết thúc</p>
      <div className="day-row">
        {DAY_NAMES.map((d) => {
          const inRange = start !== null && end !== null && d.n >= start && d.n <= end
          const edge = d.n === start || d.n === end
          return (
            <button key={d.n} type="button" className={`day-circle${inRange ? ' in-range' : ''}${edge ? ' is-edge' : ''}`} onClick={() => pick(d.n)}>
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
            setStart(null)
            setEnd(null)
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

// Cửa sổ thêm / sửa khung giờ: tên sự kiện, khung giờ, thứ, ngày (tuỳ chọn), giá
function AddPriceDialog({ open, close, mode = 'add', initial, lockName = false, onSubmit, onClose }) {
  const [ten, setTen] = useState(initial?.ten ?? '')
  const [time, setTime] = useState(initial?.time ?? null)
  const [days, setDays] = useState(initial?.days ?? null)
  const [gia, setGia] = useState(initial?.gia ?? '')
  const [from, setFrom] = useState(initial?.ngay?.from ?? '')
  const [to, setTo] = useState(initial?.ngay?.to ?? '')
  const [showTime, setShowTime] = useState(false)
  const [showDays, setShowDays] = useState(false)
  const [error, setError] = useState('')

  const kind = days ? dayRangeKind(days[0], days[1]) : null

  const submit = () => {
    if (!time) return setError('Vui lòng chọn khung giờ.')
    if (!days) return setError('Vui lòng chọn thứ.')
    if ((from || to) && !(from && to)) return setError('Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.')
    if (from && to && from > to) return setError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.')
    const v = Number(gia)
    if (gia === '' || !Number.isInteger(v) || v < 0 || v > MAX_PRICE) {
      return setError(`Giá phải là số nguyên từ 0 đến ${MAX_PRICE.toLocaleString('vi-VN')}.`)
    }
    const message = onSubmit({ id: initial?.id, ten: ten.trim(), time, days, gia: String(v), ngay: from && to ? { from, to } : null })
    if (message) return setError(message)
    onClose()
  }

  return (
    <>
      <Dialog title={mode === 'edit' ? 'Sửa khung giờ' : 'Thêm khung giờ'} level={1} width={520} onClose={onClose}>
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

        <div className="dialog-field">
          <span>Chọn ngày:</span>
          <div className="date-pair">
            <label>
              Từ <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              Đến <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <small className="dialog-note">
            {from || to
              ? 'Backend chưa có giá theo ngày: khung này chỉ lưu trên máy này và chưa áp dụng cho khách.'
              : 'Bỏ trống nếu áp dụng quanh năm.'}
          </small>
        </div>

        <label className="dialog-field">
          <span>Giá (đ/giờ):</span>
          <input className="input" type="number" min="0" step="1000" placeholder="Nhập giá" value={gia} onChange={(e) => setGia(e.target.value)} />
        </label>

        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-two">
          <button type="button" className="dialog-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="dialog-primary" onClick={submit}>
            {mode === 'edit' ? 'Lưu' : 'Thêm'}
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

// Tìm hai dòng giá cùng loại ngày mà trùng giờ (khác loại ngày thì được phép trùng giờ)
function findClassOverlap(entries) {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (kindsOverlap(a.kind, b.kind) && toMinutes(a.time[0]) < toMinutes(b.time[1]) && toMinutes(b.time[0]) < toMinutes(a.time[1])) {
        return `Khung ${a.time[0]}–${a.time[1]} (${kindText(a.kind)}) trùng giờ với khung ${b.time[0]}–${b.time[1]} (${kindText(b.kind)}) của sự kiện "${b.ten || 'Giờ cố định'}".`
      }
    }
  }
  return null
}

// Quản lý bảng giá: API có sẵn GET /api/chu-san/dang-ky (khungGias), PUT /api/chu-san/co-so/bang-gia.
function PricingPage({ user }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branch, setBranch] = useState(null)
  const [entries, setEntries] = useState([]) // dòng giá có thể lưu vào database
  const [dated, setDated] = useState([]) // dòng giá theo ngày: chỉ lưu trên máy này
  const [savedIds, setSavedIds] = useState([]) // các dòng giá đã đồng bộ với database
  const [loading, setLoading] = useState(isOwner)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dialog, setDialog] = useState(null) // { mode, ten, lockName, initial }

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        const data = await callApi('/api/chu-san/dang-ky', { token })
        if (cancelled) return
        const coSo = data.coSo ?? null
        setBranch(coSo)
        const rows = (data.khungGias ?? []).map(toRow)
        const meta = coSo ? readPriceMeta(coSo.maCoSo) : {}
        const list = restoreEntries(rows, meta)
        setEntries(list)
        setDated(meta.dated ?? [])
        setSavedIds(list.map((x) => x.id))
      } catch (err) {
        if (!cancelled) setResult({ type: 'error', message: err.message })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const maCoSo = branch?.maCoSo
  const open = cut5(branch?.gioMoCua)
  const close = cut5(branch?.gioDongCua)
  const gaps = findPriceGaps(rowsFromEntries(entries), open, close)

  const persist = (nextEntries, nextDated) => {
    if (maCoSo) writePriceMeta(maCoSo, nextEntries, nextDated)
  }

  // Dựng lại bảng từ khung giá backend vừa trả về (sau khi lưu / xóa)
  const applyServerRows = (savedRows, nextEntries, nextDated) => {
    persist(nextEntries, nextDated)
    const list = restoreEntries(savedRows.map(toRow), readPriceMeta(maCoSo))
    setEntries(list)
    setDated(nextDated)
    setSavedIds(list.map((x) => x.id))
  }

  // Thêm / sửa một dòng giá từ cửa sổ
  const submitEntry = ({ id, ten, time, days, gia, ngay }) => {
    const kind = dayRangeKind(days[0], days[1])
    const [s, e] = time

    if (ngay) {
      // Theo ngày: chỉ lưu trên máy này; kiểm tra không trùng với dòng theo ngày khác
      const trung = dated.find(
        (d) =>
          d.id !== id &&
          d.ngay.from <= ngay.to &&
          ngay.from <= d.ngay.to &&
          toMinutes(d.time[0]) < toMinutes(e) &&
          toMinutes(s) < toMinutes(d.time[1]) &&
          kindsOverlap(d.kind, kind),
      )
      if (trung) {
        return `Trùng với khung ${trung.time[0]}–${trung.time[1]} (${toViDate(trung.ngay.from)} – ${toViDate(trung.ngay.to)}).`
      }
      const item = { id: id ?? `n-${Date.now()}`, ten, time, kind, gia, ngay }
      const nextDated = [...dated.filter((d) => d.id !== item.id), item]
      const nextEntries = id ? entries.filter((x) => x.id !== id) : entries
      setDated(nextDated)
      setEntries(nextEntries)
      persist(nextEntries, nextDated)
      setResult({ type: 'success', message: 'Đã thêm khung theo ngày. Khung này chỉ lưu trên máy này vì backend chưa có giá theo ngày.' })
      return null
    }

    // Không chọn ngày: lưu được vào database. Chỉ báo trùng khi cùng loại thứ mà trùng giờ.
    const base = id ? entries.filter((x) => x.id !== id) : entries
    const item = { id: id ?? `e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ten, time, kind, gia }
    const next = [...base, item]
    const trung = findClassOverlap(next)
    if (trung) return trung
    const message = validatePricing(rowsFromEntries(next), open, close)
    if (message) return message
    const nextDated = id ? dated.filter((d) => d.id !== id) : dated
    setEntries(next)
    setDated(nextDated)
    persist(next, nextDated)
    setResult({ type: 'success', message: 'Đã cập nhật khung giờ. Bấm "Lưu bảng giá" để lưu vào database.' })
    return null
  }

  // Gửi danh sách khung giá lên database (backend thay toàn bộ BangGia của cơ sở bằng danh sách này)
  const putRows = (list) =>
    callApi('/api/chu-san/co-so/bang-gia', {
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

  // Xóa: dòng theo ngày hoặc chưa lưu thì bỏ trên màn hình; khung giờ đã có trong database bị xóa hẳn thì xóa luôn khỏi database
  const removeEntry = async (item) => {
    if (item.ngay) {
      const nextDated = dated.filter((d) => d.id !== item.id)
      setDated(nextDated)
      persist(entries, nextDated)
      setResult(null)
      return
    }
    const next = entries.filter((x) => x.id !== item.id)
    if (!savedIds.includes(item.id)) {
      // dòng mới thêm, chưa lưu vào database: chỉ bỏ trên màn hình
      setEntries(next)
      persist(next, dated)
      setResult(null)
      return
    }
    if (next.length === 0) {
      return setResult({ type: 'error', message: 'Cơ sở cần có ít nhất 1 khung giá, không thể xóa khung cuối cùng.' })
    }
    if (!window.confirm(`Xóa khung giờ ${item.time[0]}–${item.time[1]} (${kindText(item.kind)}) khỏi bảng giá? Thay đổi được lưu ngay vào database.`)) return
    const rows = rowsFromEntries(next)
    const message = validatePricing(rows, open, close)
    if (message) return setResult({ type: 'error', message })
    setSaving(true)
    try {
      const saved = await putRows(rows)
      applyServerRows(saved, next, dated)
      setResult({ type: 'success', message: `Đã xóa khung giờ ${item.time[0]}–${item.time[1]} (${kindText(item.kind)}).` })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const rows = rowsFromEntries(entries)
    const message = validatePricing(rows, open, close)
    if (message) return setResult({ type: 'error', message })
    setSaving(true)
    try {
      const saved = await putRows(rows)
      applyServerRows(saved, entries, dated)
      setResult({ type: 'success', message: 'Đã lưu bảng giá. Giá mới áp dụng cho các lượt đặt tiếp theo.' })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  // Nhóm các dòng giá theo sự kiện
  const all = [...entries.map((e) => ({ ...e, local: false })), ...dated.map((d) => ({ ...d, local: true }))]
  const groupMap = new Map()
  all.forEach((it) => {
    const k = it.ten || ''
    groupMap.set(k, [...(groupMap.get(k) ?? []), it])
  })
  const groups = [...groupMap.entries()]
    .map(([ten, items]) => ({
      ten,
      items: items.sort(
        (a, b) => toMinutes(a.time[0]) - toMinutes(b.time[0]) || (a.ngay ? 1 : 0) - (b.ngay ? 1 : 0) || (a.ngay?.from ?? '').localeCompare(b.ngay?.from ?? ''),
      ),
    }))
    .sort((a, b) => toMinutes(a.items[0].time[0]) - toMinutes(b.items[0].time[0]))

  const openEdit = (item) =>
    setDialog({
      mode: 'edit',
      ten: item.ten,
      lockName: false,
      initial: { id: item.id, ten: item.ten, time: item.time, days: kindToDays(item.kind), gia: String(item.gia), ngay: item.ngay ?? null },
    })

  return (
    <Page>
      <div className="filters filters-inline">
        <div className="field-inline">
          <span>Cơ sở hiện tại: </span>
          <strong>{branch?.tenCoSo ?? '—'}</strong>
        </div>
        {branch && (
          <div className="field-inline">
            <span>Giờ mở cửa: </span>
            <strong>
              {open}–{close}
            </strong>
          </div>
        )}
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-pricing">
            <thead>
              <tr>
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
                  <td colSpan={5} className="table-empty">
                    Đang tải bảng giá...
                  </td>
                </tr>
              )}
              {!loading && !branch && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Tài khoản chưa khai báo cơ sở.
                  </td>
                </tr>
              )}
              {!loading && branch && groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Cơ sở chưa có khung giá nào. Bấm &quot;Thêm khung giờ&quot; để tạo.
                  </td>
                </tr>
              )}
              {groups.map((g) =>
                g.items.map((it, idx) => (
                  <tr key={it.id} className={idx === 0 ? 'group-first' : undefined}>
                    {idx === 0 && (
                      <td rowSpan={g.items.length} className="event-cell">
                        <div className="event-name">{g.ten || <span className="muted">Giờ cố định</span>}</div>
                        {/* Dấu + xanh lá: thêm khung giờ + thứ + giá vào cùng sự kiện */}
                        <button
                          type="button"
                          className="icon-btn icon-btn-plus"
                          title="Thêm khung giờ vào sự kiện này"
                          aria-label="Thêm khung giờ vào sự kiện này"
                          onClick={() => setDialog({ mode: 'add', ten: g.ten, lockName: true, initial: { ten: g.ten } })}
                        >
                          <PlusIcon />
                        </button>
                      </td>
                    )}
                    <td>
                      <span className="pill pill-sm">{it.time[0]}</span> - <span className="pill pill-sm">{it.time[1]}</span>
                    </td>
                    <td>
                      {kindText(it.kind)}
                      {it.ngay && (
                        <div className="cell-sub">
                          {toViDate(it.ngay.from)} – {toViDate(it.ngay.to)}
                        </div>
                      )}
                    </td>
                    <td>
                      {formatVnd(Number(it.gia))}/giờ
                      {it.local && <div className="cell-sub">Chỉ lưu trên máy này</div>}
                    </td>
                    <td className="td-center">
                      <div className="row-actions row-actions-center">
                        {/* Cờ lê xanh dương: sửa giá, thứ hoặc thời gian */}
                        <button type="button" className="icon-btn icon-btn-wrench" title="Sửa" aria-label="Sửa" onClick={() => openEdit(it)} disabled={saving}>
                          <WrenchIcon />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeEntry(it)} disabled={saving}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>

        <div className="pricing-actions">
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => setDialog({ mode: 'add', ten: '', lockName: false, initial: null })} disabled={!branch || loading}>
            Thêm khung giờ
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={handleSave} disabled={!branch || loading || saving}>
            {saving ? 'Đang lưu...' : 'Lưu bảng giá'}
          </button>
        </div>
      </section>

      {gaps.length > 0 && (
        <Alert type="error">
          Chưa có giá cho khoảng giờ: {gaps.join(', ')}. Khách sẽ không đặt được các khung này.
          {dated.length > 0 && ' (Các khung theo ngày chỉ lưu trên máy này nên chưa được tính vào bảng giá áp dụng cho khách.)'}
        </Alert>
      )}
      {result && <Alert type={result.type}>{result.message}</Alert>}

      {dialog && (
        <AddPriceDialog
          key={dialog.initial?.id ?? `new-${dialog.ten}`}
          open={open}
          close={close}
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

// Dữ liệu mẫu theo đúng cột bảng DanhGia (SoSao, NoiDung, NgayTao, PhanHoiChuSan, BiAn).
// Backend chưa có API chủ sân đọc DanhGia (chờ bạn duyệt đề xuất GET /api/chu-san/danh-gia), nên tạm dùng dữ liệu mẫu.
const SAMPLE_REVIEWS = [
  { maDanhGia: 1, tenKhach: 'Nguyễn Thị Mai', soSao: 5, noiDung: 'Sân sạch, đèn sáng, nhân viên thân thiện.', ngayTao: '2026-11-10T19:30:00', phanHoiChuSan: 'Cảm ơn bạn đã ủng hộ!' },
  { maDanhGia: 2, tenKhach: 'Trần Văn Nam', soSao: 4, noiDung: 'Sân tốt nhưng giờ cao điểm hơi đông.', ngayTao: '2026-11-09T21:10:00', phanHoiChuSan: null },
  { maDanhGia: 3, tenKhach: 'Lê Hoàng Phúc', soSao: 3, noiDung: 'Mặt sân hơi trơn vào buổi tối.', ngayTao: '2026-11-07T20:00:00', phanHoiChuSan: 'Cơ sở đã lau sân kỹ hơn, mong bạn quay lại.' },
  { maDanhGia: 4, tenKhach: 'Phạm Thu Hà', soSao: 5, noiDung: 'Giá hợp lý, đặt sân nhanh.', ngayTao: '2026-11-05T08:45:00', phanHoiChuSan: null },
]

function ReviewsPage() {
  const [stars, setStars] = useState('Tất cả')
  const reviews = SAMPLE_REVIEWS
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.soSao, 0) / reviews.length : 0
  const visible = reviews.filter((r) => stars === 'Tất cả' || r.soSao === Number(stars))
  const fmt = (iso) => new Date(iso).toLocaleDateString('vi-VN')

  return (
    <Page>
      <div className="filters filters-inline">
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
        <div className="table-scroll">
          <table className="table table-reviews">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Đánh giá</th>
                <th>Nội dung</th>
                <th>Ngày</th>
                <th>Phản hồi của chủ sân</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Chưa có đánh giá nào.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.maDanhGia}>
                  <td>{r.tenKhach}</td>
                  <td>
                    <span className="stars" aria-label={`${r.soSao} sao`}>
                      {'★'.repeat(r.soSao)}
                      {'☆'.repeat(5 - r.soSao)}
                    </span>
                  </td>
                  <td>{r.noiDung}</td>
                  <td>{fmt(r.ngayTao)}</td>
                  <td>{r.phanHoiChuSan ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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

function CustomersPage({ user }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branch, setBranch] = useState(null)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        // Dùng các API có sẵn: cơ sở của chủ sân + thống kê khách đã đặt sân (bao-cao/top-khach)
        const [coSo, khach] = await Promise.all([
          fetchCoSo(token),
          callApi('/api/chu-san/bao-cao/top-khach', { token }),
        ])
        if (cancelled) return
        setBranch(coSo)
        setCustomers(khach)
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
  }, [isOwner, token, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page subtitle="Khách đã đặt sân và thanh toán tại cơ sở của bạn, xếp theo số lượt đặt nhiều nhất.">
      {error && <Alert type="error">{error}</Alert>}

      <div className="filters filters-inline">
        <div className="field-inline">
          <span>Cơ sở hiện tại: </span>
          <strong>{branch?.tenCoSo ?? '—'}</strong>
        </div>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-customers">
            <thead>
              <tr>
                <th>Khách</th>
                <th>Số điện thoại</th>
                <th>Số lượt đặt</th>
                <th>Tổng chi tiêu</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="table-empty">
                    Đang tải danh sách khách hàng...
                  </td>
                </tr>
              )}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="table-empty">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
async function uploadBranchImage(token, file) {
  const body = new FormData()
  body.append('tepAnh', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/chu-san/co-so/anh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
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

// Trang chủ sân: ảnh cơ sở, thông tin tài khoản và đổi mật khẩu
// API có sẵn: GET /api/tai-khoan/ca-nhan, POST /api/tai-khoan/doi-mat-khau ({ matKhauCu, matKhauMoi })
function ProfilePage({ user }) {
  const token = user.maTruyCap
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [coSo, setCoSo] = useState(null) // cơ sở (để hiện ảnh bìa)
  const [uploading, setUploading] = useState(false)
  const [imageMsg, setImageMsg] = useState(null)

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
    if (user.vaiTro !== 'owner') return
    let cancelled = false
    fetchCoSo(token)
      .then((data) => {
        if (!cancelled) setCoSo(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token, user.vaiTro])

  const changeImage = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setImageMsg(null)
    try {
      const saved = await uploadBranchImage(token, file)
      setCoSo((prev) => ({ ...prev, duongDanAnh: saved.duongDanAnh }))
      setImageMsg({ type: 'success', message: 'Đã cập nhật ảnh cơ sở.' })
    } catch (err) {
      setImageMsg({ type: 'error', message: describeApiError(err) })
    } finally {
      setUploading(false)
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
          <div className="branch-photo">
            {coSo?.duongDanAnh ? (
              <img src={fileUrl(coSo.duongDanAnh)} alt="Ảnh cơ sở" />
            ) : (
              <div className="branch-photo-empty">Cơ sở chưa có ảnh</div>
            )}
            <label className={`btn btn-ghost btn-sm file-btn${!coSo || uploading ? ' is-disabled' : ''}`}>
              {uploading ? 'Đang tải...' : 'Đổi ảnh'}
              <input type="file" accept="image/*" hidden onChange={changeImage} disabled={!coSo || uploading} />
            </label>
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

  const branches = [ALL_BRANCHES, ...new Set(courts.map((c) => c.branch))]
  const filters = { date, setDate, branch, setBranch, branches }
  const current = MENU.find((m) => m.id === active) ?? PROFILE_PAGE

  const renderPage = () => {
    switch (active) {
      case 'profile':
        return <ProfilePage user={user} />
      case 'overview':
        return <Overview user={user} onNavigate={setActive} />
      case 'calendar':
        return <CourtMatrix user={user} />
      case 'qr':
        return <QrCheckin bookings={bookings} setBookings={setBookings} />
      case 'bookings':
        return <BookingsPage user={user} filters={filters} />
      case 'refunds':
        return <RefundsPage user={user} />
      case 'courts':
        return <CourtsPage user={user} />
      case 'pricing':
        return <PricingPage user={user} />
      case 'revenue':
        return <RevenuePage filters={filters} />
      case 'reviews':
        return <ReviewsPage />
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
          Xin chào, {user.hoTen}
        </button>
        <nav>
          {MENU.map((m) => (
            <button
              key={m.id}
              className={`nav-item${m.id === active ? ' is-active' : ''}`}
              onClick={() => setActive(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button className="nav-item nav-logout" onClick={onLogout}>
          Đăng xuất
        </button>
      </aside>

      {/* key theo trang để form được reset khi chuyển trang */}
      <main className={`content${active === 'courts' ? ' content-fit' : ''}`} key={active}>
        <PageBanner title={current.label} />
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
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Có lỗi xảy ra, vui lòng thử lại.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}

// GET /api/chu-san/co-so hiện trả về DANH SÁCH cơ sở của chủ sân (backend mới); các trang hiện làm việc với
// cơ sở đầu tiên như trước, nên lấy phần tử đầu (vẫn tương thích nếu backend trả về một đối tượng).
async function fetchCoSo(token) {
  const data = await callApi('/api/chu-san/co-so', { token })
  return Array.isArray(data) ? data[0] ?? null : data
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
  return first?.thongBao ? `${err.message}: ${first.thongBao}` : err.message
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

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-banner" aria-hidden="true">
          <svg viewBox="0 0 440 150" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
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
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function LoginPage({ onLogin, onGoRegister, notice, defaultIdentity }) {
  const [identity, setIdentity] = useState(defaultIdentity || '')
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
    if (!emailKey || !password) {
      setError('Vui lòng nhập email và mật khẩu.')
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
              setError('')
              setWarning('')
            }}
          />
        </label>
        <label className="field-block auth-field">
          <span className="label">Mật khẩu</span>
          <input
            className="input"
            type="password"
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
              setWarning('')
            }}
          />
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

function RegisterPage({ onRegistered, onGoLogin }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', bankCode: '', accountNumber: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    const phone = parseVnPhone(form.phone)
    const company = form.company.trim()
    const bankCode = form.bankCode.trim()
    const accountNumber = form.accountNumber.replace(/\s/g, '')

    if (!name || !email || !form.phone.trim() || !company || !bankCode || !accountNumber || !form.password || !form.confirm) {
      setError('Vui lòng nhập đầy đủ thông tin.')
      return
    }
    if (name.length < 2) {
      setError('Họ và tên phải có ít nhất 2 ký tự.')
      return
    }
    if (!NAME_RE.test(name)) {
      setError('Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.')
      return
    }
    if (!EMAIL_RE.test(email)) {
      setError('Email không hợp lệ.')
      return
    }
    if (!phone) {
      setError('Số điện thoại: bắt đầu bằng 0 thì nhập đủ 10 số, bắt đầu bằng số khác thì nhập đủ 9 số (hệ thống tự thêm số 0 phía trước).')
      return
    }
    if (company.length < 2 || company.length > 150) {
      setError('Tên doanh nghiệp từ 2 đến 150 ký tự.')
      return
    }
    if (!BANKS.some((b) => b.code === bankCode)) {
      setError('Vui lòng chọn ngân hàng.')
      return
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      setError('Số tài khoản gồm 6 đến 20 chữ số.')
      return
    }
    if (!isStrongPassword(form.password)) {
      setError(PASSWORD_RULE_TEXT)
      return
    }
    if (form.password !== form.confirm) {
      setError('Mật khẩu nhập lại không khớp.')
      return
    }

    setLoading(true)
    setError('')
    try {
      // Tài khoản mới ở trạng thái chờ duyệt: bỏ qua token trả về, bắt buộc đăng nhập lại sau khi được duyệt
      await registerApi({ name, email, phone, company, password: form.password, confirm: form.confirm, bankCode, accountNumber })
      // API tạo luôn hồ sơ chủ sân (đã gồm tài khoản ngân hàng) ở trạng thái chờ duyệt
      onRegistered({ email, bankError: '' })
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Đăng ký" subtitle="Thông tin đăng ký sẽ được gửi cho quản trị viên. Bạn chỉ đăng nhập được sau khi được duyệt.">
      <form onSubmit={handleSubmit} noValidate>
        <label className="field-block auth-field">
          <span className="label">Họ và tên</span>
          <input className="input" type="text" placeholder="Nguyễn Văn A" autoComplete="name" value={form.name} onChange={update('name')} />
        </label>
        <label className="field-block auth-field">
          <span className="label">Email</span>
          <input className="input" type="email" placeholder="Nhập Email của bạn" autoComplete="email" value={form.email} onChange={update('email')} />
        </label>
        <label className="field-block auth-field">
          <span className="label">Số điện thoại</span>
          <div className="phone-field">
            <span className="phone-prefix">+84</span>
            <input className="input" type="tel" inputMode="numeric" placeholder="Vui lòng nhập số điện thoại" autoComplete="tel-national" value={form.phone} onChange={update('phone')} />
          </div>
        </label>
        <label className="field-block auth-field">
          <span className="label">Tên doanh nghiệp</span>
          <input className="input" type="text" placeholder="Công ty TNHH Cầu Lông Thành Công" autoComplete="organization" value={form.company} onChange={update('company')} />
        </label>
        <label className="field-block auth-field">
          <span className="label">Ngân hàng</span>
          <select className="input" value={form.bankCode} onChange={update('bankCode')}>
            <option value="">Chọn ngân hàng</option>
            {BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} - {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-block auth-field">
          <span className="label">Số tài khoản</span>
          <input className="input" type="text" inputMode="numeric" placeholder="Vui lòng nhập số tài khoản" value={form.accountNumber} onChange={update('accountNumber')} />
          <span className="field-hint">Chủ tài khoản là họ và tên đã nhập ở trên.</span>
        </label>
        <label className="field-block auth-field">
          <span className="label">Mật khẩu</span>
          <input className="input" type="password" placeholder="Nhập mật khẩu" autoComplete="new-password" value={form.password} onChange={update('password')} />
          <span className="field-hint">{PASSWORD_RULE_TEXT}</span>
        </label>
        <label className="field-block auth-field">
          <span className="label">Nhập lại mật khẩu</span>
          <input className="input" type="password" placeholder="Nhập lại mật khẩu" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} />
        </label>
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

function App() {
  const [user, setUser] = useState(null) // { ...nguoiDung, maTruyCap }
  const [view, setView] = useState('login') // 'login' | 'register'
  const [notice, setNotice] = useState('')
  const [lastEmail, setLastEmail] = useState('')

  if (user) return <AdminApp user={user} onLogout={() => setUser(null)} />

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
      onLogin={setUser}
    />
  )
}

export default App
