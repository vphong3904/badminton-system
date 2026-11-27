// Trang: Khung quản trị: thanh menu bên trái + chọn trang hiển thị
import { useEffect, useState } from 'react'
import { callApi } from '../DungChung/api.js'
import { bangGiaDuTatCaThu, khoaSanChuaDuGia } from '../DungChung/bangGia.js'
import { ALL_BRANCHES, INITIAL_BOOKINGS, INITIAL_COURTS, MENU, PROFILE_PAGE } from '../DungChung/hangSo.js'
import { useDialogTableCss } from '../DungChung/hooks.js'
import { Alert, NavIcon, NotificationBell, Page, PageBanner } from '../DungChung/ThanhPhan.jsx'
import { todayISO } from '../DungChung/thoiGian.js'
import TrangCaiDat from './TrangCaiDat.jsx'
import TrangChuSan from './TrangChuSan.jsx'
import TrangDanhGiaKhachHang from './TrangDanhGiaKhachHang.jsx'
import TrangDanhSachKhachDatSan from './TrangDanhSachKhachDatSan.jsx'
import TrangDoanhThu from './TrangDoanhThu.jsx'
import TrangDoanhThuCoSo from './TrangDoanhThuCoSo.jsx'
import TrangHoanTien from './TrangHoanTien.jsx'
import TrangKhieuNai from './TrangKhieuNai.jsx'
import TrangLichHoatDong from './TrangLichHoatDong.jsx'
import TrangQuanLyBangGia from './TrangQuanLyBangGia.jsx'
import TrangQuanLyCoSo from './TrangQuanLyCoSo.jsx'
import TrangQuanLyDatSan from './TrangQuanLyDatSan.jsx'
import TrangQuanLySan from './TrangQuanLySan.jsx'
import TrangQuetQR from './TrangQuetQR.jsx'

function Placeholder({ title }) {
  return (
    <Page title={title} subtitle="Màn hình này chưa được xây dựng." />
  )
}


export default function TrangQuanTri({ user, onLogout, onUserChange }) {
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
  // (chỉ dùng Trang chủ sân, Quản lý cơ sở, Quản lý sân, Quản lý bảng giá). API có sẵn: GET /api/chu-san/co-so (soSan, giờ mở/đóng cửa)
  // và GET /api/chu-san/co-so/:maCoSo/bang-gia. Chỉ mở khi có ÍT NHẤT 1 cơ sở có ÍT NHẤT 1 sân (sân mới tạo đang khoá cũng tính)
  // và bảng giá của cơ sở đó phủ ĐỦ mọi khung giờ hoạt động (giờ mở – giờ đóng cửa) của cả 7 thứ (Thứ 2 – Chủ nhật).
  const [setupReady, setSetupReady] = useState(null) // null = đang kiểm tra
  const [setupTick, setSetupTick] = useState(0)
  useEffect(() => {
    if (user.vaiTro !== 'owner') return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token: user.maTruyCap })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data ? [data] : []
        const coSan = list.filter((b) => Number(b.soSan ?? 0) > 0)
        const apply = (ready) => {
          if (cancelled) return
          setSetupReady(ready)
          if (!ready) setActive((cur) => (['branches', 'courts', 'pricing', 'profile'].includes(cur) ? cur : 'branches'))
        }
        if (coSan.length === 0) return apply(false)
        return Promise.all(coSan.map((b) => callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { token: user.maTruyCap }).catch(() => null))).then((cacBangGia) => {
          // Cơ sở chưa đủ bảng giá (đã đọc được nhưng thiếu thứ/khung giờ) → khoá các sân đang hoạt động của cơ sở đó
          // (API có sẵn PATCH /api/chu-san/san/:maSan/dong; sân còn đơn đặt thì backend từ chối, bỏ qua).
          cacBangGia.forEach((bg) => {
            if (bg && !bangGiaDuTatCaThu(bg)) khoaSanChuaDuGia(user.maTruyCap, bg.maCoSo)
          })
          if (cacBangGia.some((bg) => bg && bangGiaDuTatCaThu(bg))) return apply(true)
          // có cơ sở không đọc được bảng giá → không kết luận được, tránh khoá nhầm
          apply(cacBangGia.some((bg) => bg == null))
        })
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
    if (isDisabledPage(active)) return <Alert type="warning">Trang này chỉ mở khi có ít nhất 1 cơ sở, ít nhất 1 sân và bảng giá có đủ mọi khung giờ hoạt động của cơ sở cho tất cả các thứ (Thứ 2 đến Chủ nhật). Sân sẽ ở trạng thái khoá cho đến khi bảng giá đủ. Hãy hoàn tất ở Quản lý cơ sở, Quản lý sân và Quản lý bảng giá.</Alert>
    switch (active) {
      case 'profile':
        return <TrangChuSan user={user} onUserChange={onUserChange} />
      case 'overview':
        return <TrangDoanhThuCoSo user={user} onNavigate={setActive} />
      case 'calendar':
        return <TrangLichHoatDong user={user} />
      case 'qr':
        return <TrangQuetQR bookings={bookings} setBookings={setBookings} />
      case 'bookings':
        return <TrangQuanLyDatSan user={user} filters={filters} onGoRefunds={() => setActive('refunds')} />
      case 'refunds':
        return <TrangHoanTien user={user} onNavigate={setActive} />
      case 'complaints':
        return <TrangKhieuNai user={user} />
      case 'branches':
        return <TrangQuanLyCoSo user={user} onCreated={() => setSetupTick((n) => n + 1)} />
      case 'courts':
        return <TrangQuanLySan user={user} />
      case 'pricing':
        return <TrangQuanLyBangGia user={user} />
      case 'revenue':
        return <TrangDoanhThu filters={filters} />
      case 'reviews':
        return <TrangDanhGiaKhachHang user={user} />
      case 'users':
        return <TrangDanhSachKhachDatSan user={user} />
      case 'settings':
        return <TrangCaiDat cancelHours={cancelHours} setCancelHours={setCancelHours} />
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
              title={isDisabledPage(m.id) ? 'Cần có cơ sở, sân và bảng giá đủ mọi khung giờ (Thứ 2 – Chủ nhật) trước' : undefined}
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
