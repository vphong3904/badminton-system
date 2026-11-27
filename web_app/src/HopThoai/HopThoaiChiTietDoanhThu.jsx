// Hộp thoại (cửa sổ nổi)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { Dialog, SortTh } from '../DungChung/ThanhPhan.jsx'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'

// Chi tiết doanh thu theo từng sân của một ngày (xem theo tuần) hoặc một tháng (xem theo tháng).
// Dùng API có sẵn: GET /api/chu-san/san?maCoSo= và GET /api/chu-san/dat-san?maCoSo=&tuNgay=&denNgay=&soDong=200&trang=
// Cách tính giống backend (bao-cao/doanh-thu): đơn app đã xác nhận/check-in/hoàn thành, hoặc đơn app đã huỷ sau khi thanh toán (trừ tiền đã hoàn)
// = online (chuyển khoản); đơn chủ sân tạo đã bấm "Thu tiền" = offline (tiền mặt).
async function layDonTheoKhoang(token, maCoSo, tuNgay, denNgay) {
  const ketQua = []
  for (let trang = 1; trang <= 25; trang++) {
    const data = await callApi(`/api/chu-san/dat-san?maCoSo=${maCoSo}&tuNgay=${tuNgay}&denNgay=${denNgay}&soDong=200&trang=${trang}`, { token })
    const ds = data.cacDon ?? []
    ketQua.push(...ds)
    if (ds.length === 0 || ketQua.length >= Number(data.tong ?? 0)) break
  }
  return ketQua
}

function gomDoanhThuTheoSan(cacSan, cacDon) {
  const choi = ['confirmed', 'checked_in', 'completed']
  const map = new Map(cacSan.map((s) => [s.maSan, { maSan: s.maSan, tenSan: s.tenSan, luot: 0, online: 0, offline: 0 }]))
  for (const d of cacDon) {
    let r = map.get(d.maSan)
    if (!r) {
      r = { maSan: d.maSan, tenSan: d.tenSan, luot: 0, online: 0, offline: 0 }
      map.set(d.maSan, r)
    }
    const tien = Number(d.tongTien) || 0
    if (d.nguon === 'owner') {
      if (d.trangThaiThu === 'paid' && choi.includes(d.trangThai)) {
        r.luot += 1
        r.offline += tien
      }
    } else if (choi.includes(d.trangThai)) {
      r.luot += 1
      r.online += tien
    } else if (d.trangThai === 'cancelled' && d.trangThaiThanhToan === 'success') {
      const hoan = ['refunded', 'received'].includes(d.trangThaiHoanTien) ? Math.min(tien, Number(d.soTienHoan) || 0) : 0
      r.online += tien - hoan
    }
  }
  return [...map.values()].map((r) => ({ ...r, tong: r.online + r.offline }))
}

const REVENUE_SORT_COLS = [
  { key: 'san', label: 'Sân', type: 'text', get: (r) => r.tenSan },
  { key: 'luot', label: 'Số lần hoạt động', type: 'number', num: true, get: (r) => r.luot },
  { key: 'online', label: 'Online (Chuyển khoản)', type: 'number', num: true, get: (r) => r.online },
  { key: 'offline', label: 'Offline (Tiền mặt)', type: 'number', num: true, get: (r) => r.offline },
  { key: 'tong', label: 'Tổng doanh thu', type: 'number', num: true, get: (r) => r.tong },
]

export default function HopThoaiChiTietDoanhThu({ token, maCoSo, tenCoSo, tuNgay, denNgay, title, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [sortSel, setSortSel] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([callApi(`/api/chu-san/san?maCoSo=${maCoSo}`, { token }), layDonTheoKhoang(token, maCoSo, tuNgay, denNgay)])
      .then(([cacSan, cacDon]) => {
        if (!cancelled) setRows(gomDoanhThuTheoSan(cacSan, cacDon))
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [token, maCoSo, tuNgay, denNgay])

  const tong = (rows ?? []).reduce((a, r) => ({ luot: a.luot + r.luot, online: a.online + r.online, offline: a.offline + r.offline, tong: a.tong + r.tong }), { luot: 0, online: 0, offline: 0, tong: 0 })

  return (
    <Dialog title={`Doanh thu các sân · ${title}`} width={760} fit onClose={onClose}>
      <p className="picker-hint">
        {tenCoSo}. Online (Chuyển khoản) = khách chuyển khoản qua hệ thống (đã trừ tiền hoàn); Offline (Tiền mặt) = đơn chủ sân tạo đã bấm “Thu tiền”.
      </p>
      {error && <p className="dialog-error">{error}</p>}
      <div className="table-scroll dialog-table-scroll">
        <table className="table table-revenue-detail">
          <thead>
            <tr>
              {REVENUE_SORT_COLS.map((c) => (
                <SortTh key={c.key} cols={REVENUE_SORT_COLS} k={c.key} sel={sortSel} onSel={setSortSel}>
                  {c.label}
                </SortTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Đang tải...
                </td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Cơ sở chưa có sân nào.
                </td>
              </tr>
            )}
            {sortRows(rows ?? [], REVENUE_SORT_COLS, sortSel).map((r) => (
              <tr key={r.maSan}>
                <td>{r.tenSan}</td>
                <td className="num">{r.luot}</td>
                <td className="num">{formatVnd(r.online)}</td>
                <td className="num">{formatVnd(r.offline)}</td>
                <td className="num">
                  <strong>{formatVnd(r.tong)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr className="revenue-total">
                <td>Tổng cộng</td>
                <td className="num">{tong.luot}</td>
                <td className="num">{formatVnd(tong.online)}</td>
                <td className="num">{formatVnd(tong.offline)}</td>
                <td className="num">{formatVnd(tong.tong)}</td>
              </tr>
            </tfoot>
          )}
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
