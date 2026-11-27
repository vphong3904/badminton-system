// Trang: Trang chủ sân (menu: profile)
import { useEffect, useState } from 'react'
import { callApi, describeApiError, fileUrl } from '../DungChung/api.js'
import { Alert, Page } from '../DungChung/ThanhPhan.jsx'
import { PASSWORD_RULE_TEXT, isStrongPassword } from '../DungChung/xacThuc.js'
import HopThoaiSuaHoSo from '../HopThoai/HopThoaiSuaHoSo.jsx'

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


export default function TrangChuSan({ user, onUserChange }) {
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
        <HopThoaiSuaHoSo
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
