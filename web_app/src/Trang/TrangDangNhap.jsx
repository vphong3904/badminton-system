// Trang: Đăng nhập
import { useEffect, useState } from 'react'
import { loginApi } from '../DungChung/api.js'
import { Alert, AuthShell } from '../DungChung/ThanhPhan.jsx'
import { MAX_FAILED_LOGINS, clearFailedLogins, getAccessBlockMessage, getEmailError, getLockRemaining, recordFailedLogin } from '../DungChung/xacThuc.js'

export default function TrangDangNhap({ onLogin, onGoRegister, notice, defaultIdentity }) {
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
