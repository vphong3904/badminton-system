import { useEffect, useState } from 'react'
import './App.css'
import { callApi } from './DungChung/api.js'
import { clearSession, jwtExpiry, loadSession, saveSession } from './DungChung/phienDangNhap.js'
import { nowMs, syncServerClock } from './DungChung/thoiGian.js'
import TrangDangKy from './Trang/TrangDangKy.jsx'
import TrangDangNhap from './Trang/TrangDangNhap.jsx'
import TrangQuanTri from './Trang/TrangQuanTri.jsx'

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

  if (user) return <TrangQuanTri user={user} onLogout={() => logout()} onUserChange={updateUser} />

  if (view === 'register') {
    return (
      <TrangDangKy
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
    <TrangDangNhap
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
