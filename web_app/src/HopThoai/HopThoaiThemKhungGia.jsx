// Hộp thoại (cửa sổ nổi)
import { useState } from 'react'
import { MAX_PRICE, daysText } from '../DungChung/bangGia.js'
import { isBranchBlocked } from '../DungChung/nghiepVu.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'
import { cut5 } from '../DungChung/thoiGian.js'
import { onlyDigits } from '../DungChung/xacThuc.js'
import HopThoaiChonKhungGio from './HopThoaiChonKhungGio.jsx'
import HopThoaiChonThu from './HopThoaiChonThu.jsx'

// Cửa sổ thêm / sửa khung giờ: cơ sở, tên sự kiện, khung giờ, thứ, giá. Nút Thêm / Lưu ghi thẳng vào database.
export default function HopThoaiThemKhungGia({ branches, defaultBranchId, mode = 'add', initial, lockName = false, onSubmit, onClose }) {
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
        <HopThoaiChonKhungGio
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
        <HopThoaiChonThu
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
