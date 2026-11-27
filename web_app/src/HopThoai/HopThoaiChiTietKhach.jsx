// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { Dialog, SortTh } from '../DungChung/ThanhPhan.jsx'
import { cut5, ngayGioKey, toViDate } from '../DungChung/thoiGian.js'
import { sortRows } from '../DungChung/tienIch.js'

// Cửa sổ chi tiết khách: các lượt đặt (ngày, giờ bắt đầu, giờ kết thúc, cơ sở, sân).
// API có sẵn: GET /api/chu-san/bao-cao/khach-hang/chi-tiet?maKhachHang= (hoặc soDienThoai=) &maCoSo=
const DETAIL_SORT_COLS = (nhan) => [
  { key: 'ngay', label: 'Ngày', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'gioBd', label: 'Giờ bắt đầu', type: 'time', get: (d) => cut5(d.gioBatDau) },
  { key: 'gioKt', label: 'Giờ kết thúc', type: 'time', get: (d) => cut5(d.gioKetThuc) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (d) => nhan[d.trangThai] ?? d.trangThai },
]

export default function HopThoaiChiTietKhach({ token, customer, maCoSo, onClose }) {
  const [sortSel, setSortSel] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const who = customer.maKhachHang ? `maKhachHang=${customer.maKhachHang}` : `soDienThoai=${encodeURIComponent(customer.soDienThoai)}`
    callApi(`/api/chu-san/bao-cao/khach-hang/chi-tiet?${who}${maCoSo === 'all' ? '' : `&maCoSo=${maCoSo}`}&soDong=100`, { token })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, customer, maCoSo])
  const nhan = { confirmed: 'Đã đặt', completed: 'Đã chơi', cancelled: 'Đã huỷ', pending_payment: 'Chờ thanh toán', expired: 'Hết hạn' }
  return (
    <Dialog title={`Chi tiết lượt đặt – ${customer.tenKhach}`} width={760} fit onClose={onClose}>
      <p className="picker-hint">{customer.soDienThoai}</p>
      {error && <p className="dialog-error">{error}</p>}
      {!data && !error && <p className="picker-hint">Đang tải...</p>}
      {data && (
        <>
        <div className="table-scroll dialog-table-scroll">
          <table className="table table-detail">
            <thead>
              <tr>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="gioBd" sel={sortSel} onSel={setSortSel}>Giờ bắt đầu</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="gioKt" sel={sortSel} onSel={setSortSel}>Giờ kết thúc</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={DETAIL_SORT_COLS(nhan)} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortRows(data.cacDon ?? [], DETAIL_SORT_COLS(nhan), sortSel).map((d) => (
                <tr key={d.maDatSan}>
                  <td>{toViDate(String(d.ngay).slice(0, 10))}</td>
                  <td>{cut5(d.gioBatDau)}</td>
                  <td>{cut5(d.gioKetThuc)}</td>
                  <td>{d.tenCoSo}</td>
                  <td>{d.tenSan}</td>
                  <td>{nhan[d.trangThai] ?? d.trangThai}</td>
                </tr>
              ))}
              {(data.cacDon ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Chưa có lượt đặt nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}
