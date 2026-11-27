// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError, fileUrl, uploadAvatarImage } from '../DungChung/api.js'
import { BANKS } from '../DungChung/hangSo.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'
import { getEmailError, onlyDigits } from '../DungChung/xacThuc.js'

// Cửa sổ sửa thông tin chủ sân. API có sẵn: PATCH /api/tai-khoan/ca-nhan { hoTen, email, soDienThoai, soDienThoaiPhu },
// POST /api/tai-khoan/ca-nhan/anh (ảnh đại diện, trường tepAnh), PATCH /api/chu-san/ngan-hang { maNganHang, soTaiKhoan, chuTaiKhoan }
// (đổi tài khoản nhận tiền, mọi trạng thái hồ sơ) và PUT /api/chu-san/dang-ky/doanh-nghiep { tenDoanhNghiep }
// (backend chỉ cho sửa khi hồ sơ bị từ chối — hồ sơ đã duyệt thì backend chưa có API đổi tên doanh nghiệp).
export default function HopThoaiSuaHoSo({ token, person, owner, onClose, onSaved }) {
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
