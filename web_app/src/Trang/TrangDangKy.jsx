// Trang: Đăng ký chủ sân
import { useState } from 'react'
import { describeApiError, registerApi } from '../DungChung/api.js'
import { BANKS } from '../DungChung/hangSo.js'
import { Alert, AuthShell, PasswordInput } from '../DungChung/ThanhPhan.jsx'
import { onlyDigits, parseVnPhone, validateRegister } from '../DungChung/xacThuc.js'

export default function TrangDangKy({ onRegistered, onGoLogin }) {
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
