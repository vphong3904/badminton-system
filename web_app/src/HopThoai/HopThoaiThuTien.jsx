// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { Dialog, SortTh } from '../DungChung/ThanhPhan.jsx'
import { cut5, ngayGioKey, toViDate } from '../DungChung/thoiGian.js'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'

// Cửa sổ "Thu tiền": các đơn chủ sân đã tạo mà chưa thu tiền (vd khách đặt trước qua Zalo). Bấm "Thu tiền" → đơn thành "Đã thanh toán" và lên lịch.
// API có sẵn: GET /api/chu-san/dat-san (lọc đơn của chủ sân chưa thu phía web), PATCH /api/chu-san/dat-san/:maDatSan/da-thu
const COLLECT_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (d) => d.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (d) => d.soDienThoaiLienHe },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'ngay', label: 'Ngày', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'gio', label: 'Giờ', type: 'time', get: (d) => String(d.gioBatDau ?? '').slice(0, 5) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'tien', label: 'Tổng tiền', type: 'number', get: (d) => Number(d.tongTien) },
]

export default function HopThoaiThuTien({ token, onClose, onChanged }) {
  const [sortSel, setSortSel] = useState('')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      ['confirmed', 'completed'].map((tt) => callApi(`/api/chu-san/dat-san?trangThai=${tt}&sapXep=cu-nhat&soDong=200`, { token })),
    )
      .then((kq) => {
        if (cancelled) return
        const dsach = kq
          .flatMap((r) => r.cacDon)
          .filter((d) => d.nguon === 'owner' && d.trangThaiThu !== 'paid')
          .sort((a, b) => `${String(a.ngay).slice(0, 10)} ${a.gioBatDau}`.localeCompare(`${String(b.ngay).slice(0, 10)} ${b.gioBatDau}`))
        setRows(dsach)
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, reload])

  const collect = async (d) => {
    setBusyId(d.maDatSan)
    setError('')
    try {
      // Backend yêu cầu body là một object (z.object({})) nên phải gửi {} chứ không được bỏ trống
      await callApi(`/api/chu-san/dat-san/${d.maDatSan}/da-thu`, { method: 'PATCH', token, body: {} })
      setReload((n) => n + 1)
      onChanged(`Đã thu tiền đơn của ${d.tenKhach}: đơn chuyển sang Đã thanh toán và hiện trên Lịch hoạt động.`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog title="Thu tiền" width={820} fit onClose={onClose}>
      <p className="picker-hint">Các đơn bạn đã tạo và đang chờ thu tiền. Bấm “Thu tiền” khi khách đã trả.</p>
      {error && <p className="dialog-error">{error}</p>}
      <div className="table-scroll dialog-table-scroll">
        <table className="table table-collect">
          <thead>
            <tr>
              <SortTh cols={COLLECT_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="gio" sel={sortSel} onSel={setSortSel}>Giờ</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
              <SortTh cols={COLLECT_SORT_COLS} k="tien" sel={sortSel} onSel={setSortSel}>Tổng tiền</SortTh>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Đang tải...
                </td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Không có đơn nào đang chờ thu tiền.
                </td>
              </tr>
            )}
            {sortRows(rows ?? [], COLLECT_SORT_COLS, sortSel).map((d) => (
              <tr key={d.maDatSan}>
                <td>{d.tenKhach}</td>
                <td>{d.soDienThoaiLienHe ?? '—'}</td>
                <td>{d.tenSan}</td>
                <td>{toViDate(String(d.ngay).slice(0, 10))}</td>
                <td>
                  {cut5(d.gioBatDau)}–{cut5(d.gioKetThuc)}
                </td>
                <td>{d.tenCoSo}</td>
                <td>{formatVnd(d.tongTien)}</td>
                <td>
                  <button type="button" className="btn btn-sm btn-approve" disabled={busyId === d.maDatSan} onClick={() => collect(d)}>
                    Thu tiền
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dialog-two">
        <button type="button" className="dialog-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  )
}
