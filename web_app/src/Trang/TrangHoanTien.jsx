// Trang: Hoàn tiền (menu: refunds)
import { useEffect, useRef, useState } from 'react'
import { callApi, describeApiError, fileUrl, postMultipart } from '../DungChung/api.js'
import { useAutoRefresh } from '../DungChung/hooks.js'
import { Alert, Dialog, NavIcon, Page, SortTh } from '../DungChung/ThanhPhan.jsx'
import { ngayGioKey, toViDate } from '../DungChung/thoiGian.js'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'

// Hoàn tiền: khách huỷ đơn đã thanh toán → chủ sân chuyển khoản hoàn rồi bấm "Đã hoàn tiền"
// API có sẵn: GET /api/chu-san/hoan-tien?trangThai=processing|refunded, POST /api/chu-san/hoan-tien/:maThanhToan/hoan-thanh
export default function TrangHoanTien({ user, onNavigate }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [tab, setTab] = useState('processing')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const lastTab = useRef('')

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    if (lastTab.current !== tab) setLoading(true)
    lastTab.current = tab
    callApi(`/api/chu-san/hoan-tien?trangThai=${tab}`, { token })
      .then((data) => {
        if (!cancelled) setRows(data)
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
  }, [isOwner, token, tab, reload, tick])

  const [confirming, setConfirming] = useState(null) // yêu cầu đang mở hộp xác nhận hoàn tiền
  const [anhFile, setAnhFile] = useState(null) // ảnh chứng từ chuyển khoản hoàn
  const [anhXem, setAnhXem] = useState('') // đường dẫn xem trước ảnh vừa chọn
  const [daChuyen, setDaChuyen] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const openConfirm = (r) => {
    setConfirming(r)
    setAnhFile(null)
    setAnhXem('')
    setDaChuyen(false)
    setDialogError('')
  }

  const chonAnh = (e) => {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (anhXem) URL.revokeObjectURL(anhXem)
    setAnhFile(f)
    setAnhXem(f ? URL.createObjectURL(f) : '')
    setDialogError('')
  }

  // Chủ sân chuyển khoản cho khách trước, rồi tải ảnh chứng từ chuyển khoản và xác nhận.
  // API có sẵn: POST /api/chu-san/hoan-tien/:maThanhToan/hoan-thanh (multipart, trường anhChungTu bắt buộc) — khách nhận thông báo kèm ảnh.
  const complete = async (e) => {
    e.preventDefault()
    const r = confirming
    if (!anhFile) {
      setDialogError('Vui lòng thêm ảnh chứng từ chuyển khoản hoàn tiền để khách đối chiếu.')
      return
    }
    if (!/^image\/(jpeg|png|webp)$/.test(anhFile.type)) {
      setDialogError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
      return
    }
    if (!daChuyen) {
      setDialogError('Vui lòng tích xác nhận bạn đã chuyển khoản đúng số tiền cho khách.')
      return
    }
    setBusyId(r.maThanhToan)
    setDialogError('')
    setError('')
    try {
      const body = new FormData()
      body.append('anhChungTu', anhFile)
      await postMultipart(token, `/api/chu-san/hoan-tien/${r.maThanhToan}/hoan-thanh`, body)
      setNotice(`Đã ghi nhận hoàn tiền cho ${r.tenKhach}. Khách sẽ nhận thông báo kèm ảnh chứng từ.`)
      if (anhXem) URL.revokeObjectURL(anhXem)
      setConfirming(null)
      setReload((n) => n + 1)
    } catch (err) {
      setDialogError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  // Mức hoàn theo chính sách: huỷ trước ≥24h hoàn 100%, 12–24h hoàn 50% (huỷ < 12h không có yêu cầu hoàn tiền)
  const refundLevel = (r) => {
    const daTra = Number(r.soTienDaTra)
    const hoan = Number(r.soTienHoan ?? r.soTienDaTra)
    const pct = daTra > 0 ? Math.round((hoan / daTra) * 100) : 100
    let hours = null
    if (r.ngayHuy && r.ngay && r.gioBatDau) {
      const play = new Date(`${String(r.ngay).slice(0, 10)}T${String(r.gioBatDau).slice(0, 8)}`)
      const gap = (play - new Date(r.ngayHuy)) / 3600000
      if (Number.isFinite(gap)) hours = Math.max(0, Math.floor(gap))
    }
    return { pct, hours }
  }
  // Trạng thái hiển thị (dùng dữ liệu API có sẵn GET /api/chu-san/hoan-tien): quaHan = HanHoan < NOW(); escalated = backend đã báo Admin
  const refundStatus = (r) => {
    if (tab === 'refunded' || r.trangThaiHoanTien === 'refunded' || r.trangThaiHoanTien === 'received') return 'Đã hoàn tiền'
    return r.quaHan || r.trangThaiHoanTien === 'escalated' ? 'Quá hạn hoàn tiền' : 'Chờ hoàn tiền'
  }
  const REFUND_BADGE = { 'Chờ hoàn tiền': 'wait', 'Quá hạn hoàn tiền': 'no', 'Đã hoàn tiền': 'ok' }
  const refundCols = [
    { key: 'khach', label: 'Khách', type: 'text', get: (r) => r.tenKhach },
    { key: 'don', label: 'Đơn đặt', type: 'date', get: (r) => ngayGioKey(r.ngay, r.gioBatDau) },
    { key: 'muc', label: 'Mức hoàn', type: 'number', get: (r) => refundLevel(r).pct },
    { key: 'tien', label: 'Số tiền hoàn', type: 'number', get: (r) => Number(r.soTienHoan ?? r.soTienDaTra) },
    { key: 'nganHang', label: 'Tài khoản nhận hoàn tiền', type: 'text', get: (r) => r.tenNganHang },
    { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (r) => refundStatus(r) },
    { key: 'ngayHoan', label: 'Ngày hoàn', type: 'date', get: (r) => r.ngayHoan ?? r.ngayHuy },
  ]

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="tab-strip" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'processing'} className={`tab-strip-btn${tab === 'processing' ? ' active' : ''}`} onClick={() => setTab('processing')}>
          <NavIcon id="refunds" size={16} /> Chờ hoàn tiền
        </button>
        <button type="button" role="tab" aria-selected={tab === 'refunded'} className={`tab-strip-btn${tab === 'refunded' ? ' active' : ''}`} onClick={() => setTab('refunded')}>
          Đã hoàn tiền
        </button>
      </div>

      {tab === 'processing' && (
        <p className="hint refund-policy">
          Quy định hoàn tiền: khách huỷ sân trước giờ chơi <strong>từ 24 giờ trở lên</strong> được hoàn <strong>100%</strong>; <strong>từ 12 đến dưới 24 giờ</strong> hoàn <strong>50%</strong>; dưới 12 giờ không hoàn tiền.
          Hãy chuyển khoản cho khách trước, sau đó bấm “Hoàn tiền” và thêm ảnh chứng từ chuyển khoản để khách đối chiếu.
        </p>
      )}

      <section className="card table-card tab-attached">
        <div className="table-scroll">
          <table className="table table-refunds">
            <thead>
              <tr>
                <SortTh cols={refundCols} k="khach" sel={sortSel} onSel={setSortSel}>Khách</SortTh>
                <SortTh cols={refundCols} k="don" sel={sortSel} onSel={setSortSel}>Đơn đặt</SortTh>
                <SortTh cols={refundCols} k="muc" sel={sortSel} onSel={setSortSel}>Mức hoàn</SortTh>
                <SortTh cols={refundCols} k="tien" sel={sortSel} onSel={setSortSel}>Số tiền hoàn</SortTh>
                <SortTh cols={refundCols} k="nganHang" sel={sortSel} onSel={setSortSel}>Tài khoản nhận hoàn tiền</SortTh>
                <SortTh cols={refundCols} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                {tab === 'processing' ? <th>Thao tác</th> : <SortTh cols={refundCols} k="ngayHoan" sel={sortSel} onSel={setSortSel}>Ngày hoàn · ảnh chứng từ</SortTh>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty">
                    {tab === 'processing' ? 'Không có yêu cầu hoàn tiền nào đang chờ.' : 'Chưa có khoản hoàn tiền nào.'}
                  </td>
                </tr>
              )}
              {!loading &&
                sortRows(rows, refundCols, sortSel).map((r) => (
                  <tr key={r.maThanhToan}>
                    <td>
                      {r.tenKhach}
                      <div className="cell-sub">{r.soDienThoai}</div>
                    </td>
                    <td>
                      {r.tenSan} · {toViDate(String(r.ngay).slice(0, 10))}
                      <div className="cell-sub">
                        {r.gioBatDau.slice(0, 5)} – {r.gioKetThuc.slice(0, 5)}
                      </div>
                    </td>
                    <td>
                      <span className={`refund-pct${refundLevel(r).pct >= 100 ? ' is-full' : ''}`}>Hoàn {refundLevel(r).pct}%</span>
                      {refundLevel(r).hours !== null && <div className="cell-sub">Huỷ trước giờ chơi {refundLevel(r).hours} giờ</div>}
                    </td>
                    <td>{formatVnd(Number(r.soTienHoan ?? r.soTienDaTra))}</td>
                    <td>
                      {r.tenNganHang ? (
                        <>
                          {r.tenNganHang} · {r.soTaiKhoan}
                          <div className="cell-sub">{r.chuTaiKhoan}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`status-badge status-${REFUND_BADGE[refundStatus(r)]}`}>{refundStatus(r)}</span>
                      {tab === 'processing' && r.hanHoan && (
                        <div className="cell-sub">Hạn hoàn: {toViDate(String(r.hanHoan).slice(0, 10))} {String(r.hanHoan).slice(11, 16)}</div>
                      )}
                    </td>
                    <td>
                      {tab === 'processing' ? (
                        <button type="button" className="btn btn-sm btn-approve" disabled={busyId === r.maThanhToan} onClick={() => openConfirm(r)}>
                          Hoàn tiền
                        </button>
                      ) : (
                        <>
                          {r.ngayHoan ? toViDate(String(r.ngayHoan).slice(0, 10)) : '—'}
                          {r.anhChungTuUrl && (
                            <a href={fileUrl(r.anhChungTuUrl)} target="_blank" rel="noreferrer" className="refund-proof-link" title="Mở ảnh chứng từ">
                              <img className="refund-proof-thumb" src={fileUrl(r.anhChungTuUrl)} alt="Ảnh chứng từ hoàn tiền" />
                            </a>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirming && (
        <Dialog title="Xác nhận hoàn tiền cho khách" onClose={() => busyId === null && setConfirming(null)} width={520}>
          <form onSubmit={complete} noValidate>
            <div className="refund-summary">
              <div>
                Khách: <strong>{confirming.tenKhach}</strong> · {confirming.soDienThoai}
              </div>
              <div>
                Đơn: {confirming.tenSan} · {toViDate(String(confirming.ngay).slice(0, 10))} · {confirming.gioBatDau.slice(0, 5)} – {confirming.gioKetThuc.slice(0, 5)}
              </div>
              <div>
                Mức hoàn: <strong>{refundLevel(confirming).pct}%</strong>
                {refundLevel(confirming).hours !== null && ` (khách huỷ trước giờ chơi ${refundLevel(confirming).hours} giờ)`}
              </div>
              <div className="refund-amount">Số tiền cần chuyển: {formatVnd(Number(confirming.soTienHoan ?? confirming.soTienDaTra))}</div>
              <div>
                Chuyển tới:{' '}
                {confirming.tenNganHang ? (
                  <strong>
                    {confirming.tenNganHang} · {confirming.soTaiKhoan} · {confirming.chuTaiKhoan}
                  </strong>
                ) : (
                  'Khách chưa cung cấp tài khoản nhận tiền'
                )}
              </div>
            </div>
            <label className="dialog-field">
              <span>Ảnh chứng từ chuyển khoản hoàn tiền *</span>
              <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chonAnh} />
            </label>
            {anhXem && <img className="refund-proof-preview" src={anhXem} alt="Ảnh chứng từ đã chọn" />}
            <label className="refund-check">
              <input type="checkbox" checked={daChuyen} onChange={(e) => setDaChuyen(e.target.checked)} />
              <span>Tôi đã chuyển khoản đúng số tiền cho khách. Khách sẽ nhận thông báo kèm ảnh chứng từ này.</span>
            </label>
            {dialogError && <p className="dialog-error">{dialogError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setConfirming(null)} disabled={busyId !== null}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={busyId !== null}>
                {busyId !== null ? 'Đang gửi...' : 'Xác nhận đã chuyển tiền'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Page>
  )
}
