// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { MAX_RANGE_DAYS } from '../DungChung/hangSo.js'
import { tinhTongGia } from '../DungChung/nghiepVu.js'
import { Dialog, ViDateInput } from '../DungChung/ThanhPhan.jsx'
import { cut5, eachDay, slotTimes, toHHMM, toMinutes, todayISO, vnClock } from '../DungChung/thoiGian.js'
import { formatVnd } from '../DungChung/tienIch.js'
import { onlyDigits } from '../DungChung/xacThuc.js'

// Cửa sổ "Tạo đơn cho khách": chủ sân tự tạo đơn (khách vãng lai hoặc khách cố định nhiều ngày).
// API có sẵn: POST /api/chu-san/dat-san; tổng giá tính từ GET /api/chu-san/co-so/:maCoSo/bang-gia (giá chính thức do backend tính khi tạo đơn).
export default function HopThoaiTaoDonDat({ token, courts, branch, defaultCourtId, defaultDate, onClose, onCreated }) {
  const openMin = toMinutes(cut5(branch.gioMoCua))
  const closeMin = toMinutes(cut5(branch.gioDongCua))
  const times = slotTimes(openMin, closeMin)
  const gioToiThieu = 60 // thời gian chơi tối thiểu 1 tiếng
  const [maSan, setMaSan] = useState(String(defaultCourtId ?? courts[0]?.maSan ?? ''))
  const [ngay, setNgay] = useState(defaultDate)
  const homNay = todayISO()
  const nowMin = vnClock().getUTCHours() * 60 + vnClock().getUTCMinutes()
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
          <input className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} placeholder="VD: 0912345678" value={soDienThoai} onChange={(e) => setSoDienThoai(onlyDigits(e.target.value))} />
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
