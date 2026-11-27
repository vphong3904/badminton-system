// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'
import { cut5, toViDate } from '../DungChung/thoiGian.js'

// Cửa sổ "Chuyển sân": đổi sân của khách sang sân khác CÙNG cơ sở, cùng ngày giờ (giá giữ nguyên, không hoàn / thu thêm).
// Chỉ dùng API có sẵn (backend không có API chuyển sân riêng, việc chuyển nằm trong API khoá sân):
//   GET  /api/chu-san/khoa-san/xem-truoc  → sân thay thế còn trống (cacSanThayThe) cho đúng khung giờ của đơn
//   POST /api/chu-san/khoa-san + xuLyDonVuong [{ maDatSan, hanhDong: 'chuyen-san', maSanMoi }] → chuyển đơn, khách nhận thông báo
//   DELETE /api/chu-san/khoa-san/:maKhoa  → API khoá sân luôn khoá lại khung giờ vừa trống ở sân cũ, nên web gỡ khoá đó ngay để sân cũ nhận khách khác.
export default function HopThoaiChuyenSan({ token, order, onClose, onDone }) {
  const ngay = String(order.ngay).slice(0, 10)
  const bd = cut5(order.gioBatDau)
  const kt = cut5(order.gioKetThuc)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState([])
  const [maSanMoi, setMaSanMoi] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    callApi(`/api/chu-san/khoa-san/xem-truoc?maSan=${order.maSan}&tuNgay=${ngay}&denNgay=${ngay}&gioBatDau=${bd}&gioKetThuc=${kt}`, { token })
      .then((data) => {
        if (cancelled) return
        const mo = (data.cacDonVuong ?? []).find((x) => Number(x.maDatSan) === Number(order.maDatSan))
        const ds = mo?.cacSanThayThe ?? []
        setOptions(ds)
        setMaSanMoi(ds[0] ? String(ds[0].maSan) : '')
        if (!mo) setError('Không tìm thấy đơn trong khung giờ này.')
        else if (!ds.length) setError(mo.lyDoKhongXuLy || 'Không còn sân nào trống đúng khung giờ này để chuyển.')
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, order.maSan, order.maDatSan, ngay, bd, kt])

  const submit = async () => {
    if (!maSanMoi) return setError('Vui lòng chọn sân muốn chuyển tới.')
    setBusy(true)
    setError('')
    try {
      const kq = await callApi('/api/chu-san/khoa-san', {
        method: 'POST',
        token,
        body: {
          maSan: order.maSan,
          tuNgay: ngay,
          denNgay: ngay,
          gioBatDau: bd,
          gioKetThuc: kt,
          lyDo: 'Chuyển sân cho khách',
          xuLyDonVuong: [{ maDatSan: order.maDatSan, hanhDong: 'chuyen-san', maSanMoi: Number(maSanMoi) }],
        },
      })
      let conKhoa = false
      for (const k of kq.cacKhoa ?? []) {
        try {
          await callApi(`/api/chu-san/khoa-san/${k.maKhoa}`, { method: 'DELETE', token })
        } catch {
          conKhoa = true
        }
      }
      const tenMoi = options.find((o) => String(o.maSan) === maSanMoi)?.tenSan ?? ''
      onDone(`Đã chuyển đơn của ${order.tenKhach} sang ${tenMoi}.${conKhoa ? ' Khung giờ ở sân cũ đang bị khoá, hãy gỡ khoá ở Lịch hoạt động nếu muốn nhận khách khác.' : ''}`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Chuyển sân cho khách" width={480} onClose={() => !busy && onClose()}>
      <div className="refund-summary">
        <div>
          Khách: <strong>{order.tenKhach}</strong> · {order.soDienThoaiLienHe ?? '—'}
        </div>
        <div>
          Đơn: {order.tenSan} · {toViDate(ngay)} · {bd} – {kt}
        </div>
        <div>Giá và giờ chơi giữ nguyên, khách không phải trả thêm hay được hoàn tiền.</div>
      </div>
      <label className="dialog-field">
        <span>Chuyển tới sân</span>
        <select className="input" value={maSanMoi} onChange={(e) => setMaSanMoi(e.target.value)} disabled={loading || options.length === 0 || busy}>
          {loading && <option>Đang tìm sân trống...</option>}
          {!loading && options.length === 0 && <option>Không có sân trống</option>}
          {options.map((o) => (
            <option key={o.maSan} value={String(o.maSan)}>
              {o.tenSan}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy || loading || !maSanMoi}>
          {busy ? 'Đang chuyển...' : 'Chuyển sân'}
        </button>
      </div>
    </Dialog>
  )
}
