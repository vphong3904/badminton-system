// Trang: Danh sách khách đặt sân (menu: users)
import { useEffect, useState } from 'react'
import { callApi } from '../DungChung/api.js'
import { useAutoRefresh, useBranches } from '../DungChung/hooks.js'
import { isBranchBlocked } from '../DungChung/nghiepVu.js'
import { Alert, Page, SortTh } from '../DungChung/ThanhPhan.jsx'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'
import HopThoaiChiTietKhach from '../HopThoai/HopThoaiChiTietKhach.jsx'

const CUSTOMER_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (c) => c.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (c) => c.soDienThoai },
  { key: 'luot', label: 'Số lượt đặt', type: 'number', get: (c) => Number(c.soLuotDat) },
  { key: 'chi', label: 'Tổng chi tiêu', type: 'number', get: (c) => Number(c.tongChiTieu) },
]

export default function TrangDanhSachKhachDatSan({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [customers, setCustomers] = useState([])
  const [detail, setDetail] = useState(null) // khách đang xem chi tiết
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        // API có sẵn GET /api/chu-san/bao-cao/khach-hang (có lọc maCoSo, tối đa 100 khách mỗi trang)
        const locCoSo = branchId === 'all' ? '' : `&maCoSo=${branchId}`
        const data = await callApi(`/api/chu-san/bao-cao/khach-hang?soDong=100&sapXep=luot-dat${locCoSo}`, { token })
        if (cancelled) return
        setCustomers(data.cacKhach ?? [])
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, branchId, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page subtitle="Khách đã đặt sân và thanh toán tại cơ sở của bạn, xếp theo số lượt đặt nhiều nhất.">
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => { setLoading(true); setBranchId(e.target.value) }}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-customers">
            <thead>
              <tr>
                <SortTh cols={CUSTOMER_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="luot" sel={sortSel} onSel={setSortSel}>Số lượt đặt</SortTh>
                <SortTh cols={CUSTOMER_SORT_COLS} k="chi" sel={sortSel} onSel={setSortSel}>Tổng chi tiêu</SortTh>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Đang tải danh sách khách hàng...
                  </td>
                </tr>
              )}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Chưa có khách nào đặt sân tại cơ sở này.
                  </td>
                </tr>
              )}
              {sortRows(customers, CUSTOMER_SORT_COLS, sortSel).map((c, i) => (
                <tr key={`${c.maKhachHang ?? 'vl'}-${c.soDienThoai}-${i}`}>
                  <td>{c.tenKhach}</td>
                  <td>{c.soDienThoai}</td>
                  <td>{c.soLuotDat}</td>
                  <td>{formatVnd(c.tongChiTieu)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(c)}>
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detail && <HopThoaiChiTietKhach token={token} customer={detail} maCoSo={branchId} onClose={() => setDetail(null)} />}
    </Page>
  )
}
