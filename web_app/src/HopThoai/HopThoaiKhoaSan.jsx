// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { MAX_RANGE_DAYS } from '../DungChung/hangSo.js'
import { Dialog, ViDateInput } from '../DungChung/ThanhPhan.jsx'
import { SLOT_MIN, cut5, eachDay, slotTimes, toHHMM, toMinutes, toViDate, todayISO } from '../DungChung/thoiGian.js'

// Cửa sổ "Khoá khung giờ" (bảo trì một khung giờ của sân, không phải khoá cả sân).
// API có sẵn: GET/POST /api/chu-san/khoa-san, DELETE /api/chu-san/khoa-san/:maKhoa,
// GET /api/chu-san/dat-san (tìm đơn trùng giờ), POST /api/chu-san/dat-san/:maDatSan/huy (huỷ đơn trùng giờ, khách được hoàn tiền).
// API khoá sân chỉ nhận 1 ngày mỗi lần → khoá nhiều ngày thì gọi lần lượt từng ngày (tối đa 90 ngày).
export default function HopThoaiKhoaSan({ token, courts, branch, defaultCourtId, defaultDate, onClose, onChanged }) {
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
