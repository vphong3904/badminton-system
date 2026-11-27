// Trang: Quản lý đặt sân (menu: bookings)
import { Fragment, useEffect, useRef, useState } from 'react'
import { callApi, describeApiError, fileUrl } from '../DungChung/api.js'
import { BOOKING_STATUSES } from '../DungChung/hangSo.js'
import { useAutoRefresh, useBranches, useNow } from '../DungChung/hooks.js'
import { LY_DO_SAN_CO_VAN_DE, coTheChuyenSan, coTheHuyDon, huyDonTheoLoai, isBranchBlocked, layTrangThaiDon } from '../DungChung/nghiepVu.js'
import { Alert, Dialog, Page, SortTh, ViDateInput } from '../DungChung/ThanhPhan.jsx'
import { ngayGioKey, toViDate, todayISO } from '../DungChung/thoiGian.js'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'
import HopThoaiChuyenSan from '../HopThoai/HopThoaiChuyenSan.jsx'
import HopThoaiThuTien from '../HopThoai/HopThoaiThuTien.jsx'

// Bỏ dấu để tìm kiếm tiếng Việt dễ hơn ("minh anh" khớp "Minh Anh")
const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()


// Cột sắp xếp của bảng đặt sân (giờ thanh toán = lúc khách gửi ảnh chuyển khoản, ngayGuiAnh)
const BOOKING_SORT_COLS = [
  { key: 'khach', label: 'Khách', type: 'text', get: (d) => d.tenKhach },
  { key: 'sdt', label: 'Số điện thoại', type: 'text', get: (d) => d.soDienThoaiLienHe },
  { key: 'san', label: 'Sân', type: 'text', get: (d) => d.tenSan },
  { key: 'ngayDat', label: 'Ngày đặt sân', type: 'date', get: (d) => d.ngayTao },
  { key: 'thoiGian', label: 'Thời gian chơi', type: 'date', get: (d) => ngayGioKey(d.ngay, d.gioBatDau) },
  { key: 'coSo', label: 'Cơ sở', type: 'text', get: (d) => d.tenCoSo },
  { key: 'thanhToan', label: 'Ngày giờ thanh toán', type: 'date', get: (d) => d.ngayGuiAnh },
  { key: 'ghiChu', label: 'Ghi chú', type: 'text', get: (d) => d.ghiChu },
  { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (d) => d.hienThi },
]

const BOOKING_BADGE = {
  'Chờ thanh toán': 'unpaid',
  'Đã chuyển khoản': 'paid',
  'Đã thanh toán': 'ok',
  'Đã sử dụng sân': 'ok',
  'Chờ hoàn tiền': 'wait',
  'Đã huỷ': 'no',
}


export default function TrangQuanLyDatSan({ user, filters, onGoRefunds }) {
  const { date, setDate } = filters
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [allDays, setAllDays] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Mọi trạng thái')
  const [sortSel, setSortSel] = useState('') // sắp xếp bảng (xem sortRows); rỗng = mặc định
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState('') // đường dẫn ảnh chuyển khoản đang xem
  const [cancelTarget, setCancelTarget] = useState(null) // đơn đang mở cửa sổ huỷ
  const [noteView, setNoteView] = useState(null) // đơn đang mở cửa sổ xem ghi chú đầy đủ
  const [cancelReason, setCancelReason] = useState('')
  const [cancelType, setCancelType] = useState('problem') // 'problem' | 'other'
  const [transferTarget, setTransferTarget] = useState(null) // đơn đang mở cửa sổ Chuyển sân
  const [collectOpen, setCollectOpen] = useState(false) // cửa sổ Thu tiền
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const nowTick = useNow(30000) // mốc giờ hiện tại, cập nhật mỗi 30 giây
  const lastKey = useRef('')

  // Ngày tự đổi theo thời gian thực khi sang ngày mới (chỉ khi đang xem đúng ngày hôm qua)
  useEffect(() => {
    let current = todayISO()
    const id = setInterval(() => {
      const now = todayISO()
      if (now !== current) {
        const old = current
        current = now
        setDate((prev) => (prev === old ? now : prev))
      }
    }, 30000)
    return () => clearInterval(id)
  }, [setDate])

  const maCoSo = branchId // 'all' hoặc mã cơ sở
  const hasBranches = (branches?.length ?? 0) > 0
  useEffect(() => {
    if (branches !== null && branches.length === 0) setLoading(false)
  }, [branches])

  useEffect(() => {
    if (!isOwner || !hasBranches) return
    let cancelled = false
    // Tải lại theo chu kỳ / sau thao tác thì không hiện "Đang tải" (tránh nhấp nháy)
    const key = `${maCoSo}|${date}|${allDays}`
    const silent = lastKey.current === key
    lastKey.current = key
    if (!silent) setLoading(true)
    const loc = allDays ? '' : `&ngay=${date}`
    const locCoSo = maCoSo === 'all' ? '' : `&maCoSo=${maCoSo}`
    callApi(`/api/chu-san/dat-san?soDong=200${locCoSo}${loc}`, { token })
      .then((data) => {
        if (cancelled) return
        setOrders(data.cacDon)
        setTotal(data.tong)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, hasBranches, maCoSo, date, allDays, reload, tick])

  // Xác nhận: khách đã thanh toán → đơn thành Đã xác nhận, hiện ô vàng trên Lịch hoạt động
  const confirmOrder = async (d) => {
    setBusyId(d.maDatSan)
    setError('')
    try {
      await callApi(`/api/chu-san/dat-san/${d.maDatSan}/xac-nhan-thanh-toan`, { method: 'POST', token })
      setNotice(`Đã xác nhận đơn đặt sân của ${d.tenKhach}.`)
      setReload((n) => n + 1)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const openCancel = (d) => {
    setCancelTarget(d)
    setCancelReason('')
    setCancelType('problem')
    setError('')
  }

  // Huỷ đơn: chọn API theo loại đơn (xem huyDonTheoLoai)
  const submitCancel = async () => {
    const d = cancelTarget
    // Lý do 1: Sân đang có vấn đề (cố định). Lý do 2: Lý do khác — chủ sân tự nhập (bắt buộc)
    const lyDo = cancelType === 'problem' ? LY_DO_SAN_CO_VAN_DE : cancelReason.trim()
    if (!lyDo) {
      return setError('Vui lòng nhập lý do huỷ đơn (bắt buộc).')
    }
    setBusyId(d.maDatSan)
    setError('')
    try {
      const kq = await huyDonTheoLoai(token, d, lyDo)
      if (d.nguon === 'owner') {
        setNotice(`Đã huỷ đơn của ${d.tenKhach}.`)
      } else {
        setNotice(
          kq.daThanhToan
            ? `Đã huỷ đơn của ${d.tenKhach}. Khách được hoàn ${kq.tiLeHoan}% (${formatVnd(kq.soTienHoan)}) — đơn đang ở trạng thái Chờ hoàn tiền.`
            : `Đã huỷ đơn của ${d.tenKhach}.`,
        )
      }
      setCancelTarget(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const q = normalize(query.trim())
  const visibleBase = orders
    .map((d) => ({ ...d, hienThi: layTrangThaiDon(d) }))
    .filter((d) => {
      if (!d.hienThi) return false
      if (status !== 'Mọi trạng thái' && d.hienThi !== status) return false
      const sdt = String(d.soDienThoaiLienHe ?? '')
      if (q && !normalize(d.tenKhach ?? '').includes(q) && !normalize(d.tenSan ?? '').includes(q) && !sdt.includes(query.trim())) return false
      return true
    })
    .map((d) => ({ ...d, coSoKhoa: isBranchBlocked((branches ?? []).find((b) => b.maCoSo === d.maCoSo)) }))
    // Đơn còn hủy được của cơ sở bị khoá (chưa chuyển khoản / đã chuyển khoản) đứng đầu để chủ sân huỷ
    .sort((a, b) => {
      const ua = a.coSoKhoa && coTheHuyDon(a, nowTick) ? 0 : 1
      const ub = b.coSoKhoa && coTheHuyDon(b, nowTick) ? 0 : 1
      if (ua !== ub) return ua - ub
      return allDays ? 0 : a.gioBatDau.localeCompare(b.gioBatDau)
    })
  // Có chọn sắp xếp: đơn của cơ sở bị khoá cần huỷ vẫn đứng đầu, mỗi nhóm xếp theo cột đã chọn
  const canHuyNgay = (d) => d.coSoKhoa && coTheHuyDon(d, nowTick)
  const visible = sortSel
    ? [...sortRows(visibleBase.filter(canHuyNgay), BOOKING_SORT_COLS, sortSel), ...sortRows(visibleBase.filter((d) => !canHuyNgay(d)), BOOKING_SORT_COLS, sortSel)]
    : visibleBase
  const soDonCanHuy = visible.filter((d) => d.coSoKhoa && coTheHuyDon(d, nowTick)).length
  const colCount = 10

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      {soDonCanHuy > 0 && <Alert type="warning">Có {soDonCanHuy} đơn của cơ sở đang bị khoá cần huỷ (đang đứng đầu danh sách).</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput value={date} onChange={setDate} disabled={allDays} ariaLabel="Ngày" />
        </label>
        <label className="field-inline">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} />
          <span>Mọi ngày</span>
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setNotice(''); setCollectOpen(true) }}>
          Thu tiền
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Tìm tên khách, số điện thoại hoặc sân"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm tên khách, số điện thoại hoặc sân"
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option>Mọi trạng thái</option>
          {BOOKING_STATUSES.map((st) => (
            <option key={st}>{st}</option>
          ))}
        </select>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className={`table table-bookings table-bookings-fit`}>
            <thead>
              <tr>
                <SortTh cols={BOOKING_SORT_COLS} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="sdt" sel={sortSel} onSel={setSortSel}>Số điện thoại</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="thoiGian" sel={sortSel} onSel={setSortSel}>Thời gian chơi</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="ngayDat" sel={sortSel} onSel={setSortSel}>Ngày đặt sân</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="thanhToan" sel={sortSel} onSel={setSortSel}>Ngày giờ thanh toán</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="ghiChu" sel={sortSel} onSel={setSortSel}>Ghi chú</SortTh>
                <SortTh cols={BOOKING_SORT_COLS} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Đang tải danh sách đơn...
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Không có lịch đặt nào khớp bộ lọc.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((d) => (
                  <Fragment key={d.maDatSan}>
                    <tr>
                      <td>{d.tenKhach}</td>
                      <td>{d.soDienThoaiLienHe ?? '—'}</td>
                      <td>{d.tenSan}</td>
                      <td className="cell-play-time">
                        {d.gioBatDau.slice(0, 5)} – {d.gioKetThuc.slice(0, 5)}
                        {allDays && <div className="cell-sub">{toViDate(String(d.ngay).slice(0, 10))}</div>}
                      </td>
                      <td>{d.ngayTao ? toViDate(String(d.ngayTao).slice(0, 10)) : '—'}</td>
                      <td>
                        {d.tenCoSo ?? '—'}
                        {d.coSoKhoa && <span className="branch-locked-tag"> (cơ sở bị khoá)</span>}
                      </td>
                      <td>{d.ngayGuiAnh ? `${toViDate(String(d.ngayGuiAnh).slice(0, 10))} ${String(d.ngayGuiAnh).slice(11, 16)}` : '—'}</td>
                      <td className="cell-note" title={d.ghiChu ? String(d.ghiChu) : undefined}>
                        <div className="cell-note-text">{d.ghiChu ? String(d.ghiChu) : '—'}</div>
                        {d.ghiChu && (
                          <button type="button" className="cell-note-more" onClick={() => setNoteView(d)}>
                            Mở rộng
                          </button>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${BOOKING_BADGE[d.hienThi] ?? 'unpaid'}`}
                          title={d.hienThi === 'Đã huỷ' && (d.trangThai === 'pending_payment' || d.trangThai === 'expired') ? 'Qua giờ chơi mà chưa duyệt: hệ thống tự huỷ, khách được hoàn 100% (Admin xử lý)' : undefined}
                        >
                          {d.hienThi}
                        </span>
                      </td>
                      <td>
                        {/* Nút thao tác xếp 2x2: Xem ảnh – Xác nhận / Chuyển sân – Huỷ đơn; quá thời gian đơn thì không còn nút */}
                        {(() => {
                          const choXacNhan = d.trangThai === 'pending_payment'
                          const duocHuy = coTheHuyDon(d, nowTick)
                          const duocChuyen = coTheChuyenSan(d, nowTick)
                          if (d.hienThi === 'Chờ hoàn tiền') {
                            return (
                              <div className="row-actions row-actions-grid">
                                <button type="button" className="btn btn-sm btn-approve row-actions-span" onClick={() => onGoRefunds?.()}>
                                  Đến trang Hoàn tiền
                                </button>
                              </div>
                            )
                          }
                          if (!choXacNhan && !duocHuy && !duocChuyen) return null
                          const hienHuy = choXacNhan || duocHuy // đơn chờ xác nhận luôn có nút Huỷ đơn (huỷ trước hay sau Xác nhận đều được)
                          return (
                            <div className="row-actions row-actions-grid">
                              {choXacNhan && d.anhChuyenKhoanUrl && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(fileUrl(d.anhChuyenKhoanUrl))}>
                                  Xem ảnh
                                </button>
                              )}
                              {choXacNhan && (
                                <button type="button" className="btn btn-sm btn-approve" disabled={busyId === d.maDatSan} onClick={() => confirmOrder(d)}>
                                  Xác nhận
                                </button>
                              )}
                              {duocChuyen && (
                                <button type="button" className="btn btn-sm btn-transfer" disabled={busyId === d.maDatSan} onClick={() => { setNotice(''); setError(''); setTransferTarget(d) }}>
                                  Chuyển sân
                                </button>
                              )}
                              {hienHuy && (
                                <button type="button" className="btn btn-sm btn-reject" disabled={busyId === d.maDatSan} onClick={() => openCancel(d)}>
                                  Huỷ đơn
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>

                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
        {!loading && total > orders.length && (
          <p className="hint">
            Đang hiển thị {orders.length}/{total} đơn mới nhất. Hãy chọn ngày cụ thể để xem đủ.
          </p>
        )}
      </section>

      {collectOpen && (
        <HopThoaiThuTien
          token={token}
          onClose={() => setCollectOpen(false)}
          onChanged={(msg) => {
            setNotice(msg)
            setReload((n) => n + 1)
          }}
        />
      )}

      {/* Xem ảnh chuyển khoản khách gửi */}
      {preview && (
        <div className="modal-backdrop">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Ảnh chuyển khoản của khách" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPreview('')}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Cửa sổ Chuyển sân cho khách */}
      {transferTarget && (
        <HopThoaiChuyenSan
          token={token}
          order={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={(msg) => {
            setTransferTarget(null)
            setNotice(msg)
            setReload((n) => n + 1)
          }}
        />
      )}

      {/* Cửa sổ xem đầy đủ ghi chú của khách */}
      {noteView && (
        <Dialog title="Ghi chú của khách" width={520} onClose={() => setNoteView(null)}>
          <p className="picker-hint">
            {noteView.tenKhach} · {noteView.tenSan} · {toViDate(String(noteView.ngay).slice(0, 10))} {noteView.gioBatDau.slice(0, 5)} – {noteView.gioKetThuc.slice(0, 5)}
          </p>
          <div className="note-full">{String(noteView.ghiChu)}</div>
          <div className="dialog-two">
            <button type="button" className="dialog-primary" onClick={() => setNoteView(null)}>
              Đóng
            </button>
          </div>
        </Dialog>
      )}

      {/* Cửa sổ nhập lý do huỷ đơn */}
      {cancelTarget && (
        <Dialog title="Huỷ đơn" width={460} onClose={() => setCancelTarget(null)}>
          <p className="picker-hint">
            {cancelTarget.tenKhach} · {cancelTarget.tenSan} · {cancelTarget.gioBatDau.slice(0, 5)} – {cancelTarget.gioKetThuc.slice(0, 5)}
          </p>
          <div className="cancel-reasons" role="radiogroup" aria-label="Lý do huỷ đơn">
            <label className={`cancel-reason${cancelType === 'problem' ? ' is-selected' : ''}`}>
              <input type="radio" name="cancel-reason" checked={cancelType === 'problem'} onChange={() => setCancelType('problem')} />
              <span>
                <strong>{LY_DO_SAN_CO_VAN_DE}</strong>
                <small>Đơn được gửi sang trang Hoàn tiền với lý do này, mức hoàn mặc định 100%.</small>
              </span>
            </label>
            <label className={`cancel-reason${cancelType === 'other' ? ' is-selected' : ''}`}>
              <input type="radio" name="cancel-reason" checked={cancelType === 'other'} onChange={() => setCancelType('other')} />
              <span>
                <strong>Lý do khác</strong>
                <small>Chủ sân nhập lý do bên dưới; đơn được gửi sang trang Hoàn tiền kèm lý do này.</small>
              </span>
            </label>
          </div>
          <label className={`dialog-field cancel-other${cancelType === 'other' ? ' is-active' : ''}`}>
            <span>Lý do huỷ đơn</span>
            <input
              className="input"
              type="text"
              placeholder={cancelType === 'other' ? 'Nhập lý do huỷ đơn (bắt buộc)' : 'Chọn “Lý do khác” để nhập lý do'}
              value={cancelReason}
              maxLength={255}
              disabled={cancelType !== 'other'}
              onChange={(e) => setCancelReason(e.target.value)}
              autoFocus={cancelType === 'other'}
            />
          </label>
          {error && <p className="dialog-error">{error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setCancelTarget(null)}>
              Đóng
            </button>
            <button
              type="button"
              className="dialog-danger"
              disabled={busyId === cancelTarget.maDatSan || (cancelType === 'other' && !cancelReason.trim())}
              onClick={submitCancel}
            >
              Huỷ đơn
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}
