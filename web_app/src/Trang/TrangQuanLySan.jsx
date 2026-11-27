// Trang: Quản lý sân (menu: courts)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { phanThieuBangGia } from '../DungChung/bangGia.js'
import { useAutoRefresh } from '../DungChung/hooks.js'
import { isBranchBlocked, priceAt } from '../DungChung/nghiepVu.js'
import { Alert, Dialog, LockClosedIcon, LockOpenIcon, Page, PlusIcon, SortTh, TrashIcon } from '../DungChung/ThanhPhan.jsx'
import { cut5, nowMs, todayISO } from '../DungChung/thoiGian.js'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'

export default function TrangQuanLySan({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branches, setBranches] = useState([]) // các cơ sở của chủ sân (có thể nhiều cơ sở)
  const [filterId, setFilterId] = useState('all') // bộ lọc bảng sân: 'all' = tất cả cơ sở
  const [addBranchId, setAddBranchId] = useState('') // cơ sở được chọn trong form Thêm sân
  const [courts, setCourts] = useState([])
  const [busyCourts, setBusyCourts] = useState(new Set()) // sân còn khách đặt (đơn hiện tại/sắp tới)
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false) // cửa sổ Thêm sân
  const [addError, setAddError] = useState('')
  const [giaTheoCoSo, setGiaTheoCoSo] = useState({}) // maCoSo → bảng giá (khungGias) của cơ sở đó, để hiện giá theo từng cơ sở
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Danh sách cơ sở của tài khoản (API có sẵn GET /api/chu-san/co-so)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data ? [data] : []
        setBranches(list)
        setAddBranchId((cur) => (cur && list.some((b) => String(b.maCoSo) === cur) ? cur : list[0] ? String(list[0].maCoSo) : ''))
        if (list.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])

  // Sân theo bộ lọc cơ sở (mặc định tất cả cơ sở) + các đơn còn hiệu lực để biết sân nào còn khách (được phép xoá hay chưa)
  useEffect(() => {
    if (!isOwner || branches.length === 0) return
    let cancelled = false
    const locCoSo = filterId === 'all' ? '' : `maCoSo=${filterId}`
    async function load() {
      try {
        const [cacSan, bangGias, don] = await Promise.all([
          callApi(`/api/chu-san/san${locCoSo ? `?${locCoSo}` : ''}`, { token }),
          // Bảng giá theo từng cơ sở (API có sẵn GET /api/chu-san/co-so/:maCoSo/bang-gia)
          Promise.all(branches.map((b) => callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { token }).catch(() => null))),
          callApi(`/api/chu-san/dat-san?${locCoSo ? `${locCoSo}&` : ''}tuNgay=${todayISO()}&soDong=200`, { token }),
        ])
        if (cancelled) return
        const bayGio = new Date(nowMs())
        const conKhach = new Set(
          (don.cacDon ?? [])
            .filter((d) => {
              // Giống backend: đơn chuyển khoản chờ duyệt còn hạn giữ chỗ, hoặc đơn đã xác nhận mà CHƯA qua giờ kết thúc (đơn cũ/đã qua ngày không tính)
              if (d.trangThai === 'pending_payment') return !d.hetHanGiuCho || Number.isNaN(Date.parse(d.hetHanGiuCho)) || new Date(d.hetHanGiuCho.replace(' ', 'T')) > bayGio
              if (d.trangThai !== 'confirmed' && d.trangThai !== 'checked_in') return false
              return new Date(`${String(d.ngay).slice(0, 10)}T${cut5(d.gioKetThuc)}:00+07:00`) > bayGio
            })
            .map((d) => d.maSan),
        )
        setCourts(cacSan)
        setBusyCourts(conKhach)
        const gia = {}
        bangGias.forEach((g) => {
          if (g) gia[g.maCoSo] = g.khungGias ?? []
        })
        setGiaTheoCoSo(gia)
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
  }, [isOwner, token, filterId, branches, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const branch = branches.find((b) => String(b.maCoSo) === addBranchId) ?? null
  const branchOf = (maCoSo) => branches.find((b) => b.maCoSo === maCoSo)
  const themDuoc = branches.filter((b) => !isBranchBlocked(b)) // chỉ thêm sân vào cơ sở không bị khoá

  // Giá hiện tại của sân = giá của CƠ SỞ chứa sân theo Quản lý bảng giá (thời điểm hiện tại, ngày thường / cuối tuần)
  const priceOf = (court) => {
    const khungGias = giaTheoCoSo[court.maCoSo] ?? []
    const gia = priceAt(khungGias, new Date(nowMs()))
    if (gia != null) return `${formatVnd(gia)}/giờ`
    return khungGias.length > 0 ? 'Ngoài giờ' : '—'
  }

  const courtCols = [
    { key: 'san', label: 'Sân', type: 'text', get: (c) => c.tenSan },
    { key: 'coSo', label: 'Cơ sở', type: 'text', get: (c) => c.tenCoSo ?? branchOf(c.maCoSo)?.tenCoSo },
    { key: 'gia', label: 'Giá', type: 'number', get: (c) => priceAt(giaTheoCoSo[c.maCoSo] ?? [], new Date(nowMs())) },
    { key: 'trangThai', label: 'Trạng thái', type: 'text', get: (c) => (c.trangThai === 'active' && !isBranchBlocked(branchOf(c.maCoSo)) ? 'Hoạt động' : 'Đã khoá') },
  ]
  const changeFilter = (e) => {
    setFilterId(e.target.value)
    setCourts([])
    setLoading(true)
    setError('')
    setSuccess('')
  }

  // Khoá sân / Mở khoá sân: sân bị khoá thì khách (app) không đặt được nữa, đơn đã đặt vẫn giữ nguyên
  // Bảng giá phải phủ hết giờ hoạt động của cơ sở thì mới được mở khoá sân (trả về thông báo lỗi hoặc null).
  // API có sẵn GET /api/chu-san/co-so/:maCoSo/bang-gia (đọc mới nhất, không dùng dữ liệu cũ).
  const kiemTraBangGia = async (maCoSo) => {
    const bg = await callApi(`/api/chu-san/co-so/${maCoSo}/bang-gia`, { token })
    if ((bg.khungGias ?? []).length === 0) return `Chưa thể mở khoá sân: cơ sở "${bg.tenCoSo}" chưa có bảng giá. Hãy thêm bảng giá ở trang Quản lý bảng giá.`
    const open = cut5(bg.gioMoCua)
    const close = cut5(bg.gioDongCua)
    const thieu = phanThieuBangGia(bg)
    if (thieu.length === 0) return null
    return `Chưa thể mở khoá sân: bảng giá của "${bg.tenCoSo}" chưa đủ cho giờ hoạt động ${open}–${close} của tất cả các thứ (thiếu ${thieu.join('; ')}). Hãy bổ sung ở trang Quản lý bảng giá.`
  }

  const toggleStatus = async (court) => {
    const closing = court.trangThai === 'active'
    setError('')
    setSuccess('')
    if (closing && busyCourts.has(court.maSan)) {
      setError(`Sân "${court.tenSan}" còn đơn đặt (đã thanh toán hoặc đã xác nhận). Hãy huỷ đơn ở trang Quản lý đặt sân, khi sân đã trống mới khoá được.`)
      return
    }
    if (!closing && isBranchBlocked(branchOf(court.maCoSo))) {
      setError('Cơ sở đang bị khoá nên chưa mở được sân.')
      return
    }
    setBusyId(court.maSan)
    try {
      if (!closing) {
        const thieu = await kiemTraBangGia(court.maCoSo)
        if (thieu) {
          setError(thieu)
          return
        }
      }
      const updated = await callApi(`/api/chu-san/san/${court.maSan}/${closing ? 'dong' : 'mo'}`, {
        method: 'PATCH',
        token,
        body: {},
      })
      setCourts((prev) => prev.map((c) => (c.maSan === court.maSan ? { ...c, ...updated } : c)))
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  // Xoá mềm sân (API có sẵn DELETE /api/chu-san/san/:maSan: đánh dấu DaXoa, không xoá hẳn dòng dữ liệu):
  // sân biến mất khỏi chủ sân và khách, nhưng đơn cũ vẫn giữ tên sân để hiện trong Lịch sử của khách. Chỉ khi sân đã khoá và không còn khách đặt.
  const deleteCourt = async (court) => {
    if (!window.confirm(`Xoá sân "${court.tenSan}"?\nSân sẽ không còn hiển thị với chủ sân và khách hàng, nhưng dữ liệu không bị xoá hẳn nên lịch sử đặt sân của khách vẫn còn tên sân này.`)) return
    setBusyId(court.maSan)
    setError('')
    setSuccess('')
    try {
      await callApi(`/api/chu-san/san/${court.maSan}`, { method: 'DELETE', token, body: {} })
      setCourts((prev) => prev.filter((c) => c.maSan !== court.maSan))
      setSuccess(`Đã xoá ${court.tenSan} (xoá mềm: ẩn khỏi chủ sân và khách, vẫn giữ trong lịch sử đặt sân của khách).`)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  const openAddDialog = () => {
    setAddError('')
    setNewName('')
    const loc = themDuoc.find((b) => String(b.maCoSo) === filterId)
    setAddBranchId(String((loc ?? themDuoc[0])?.maCoSo ?? '')) // mặc định chọn cơ sở đang lọc (nếu không bị khoá)
    setAddOpen(true)
  }

  // Thêm sân mới vào cơ sở đã chọn: sân ở trạng thái Hoạt động ngay
  const addCourt = async (e) => {
    e.preventDefault()
    const tenSan = newName.trim()
    setAddError('')
    if (!tenSan) {
      setAddError('Vui lòng nhập tên sân.')
      return
    }
    if (!branch) {
      setAddError('Vui lòng chọn cơ sở.')
      return
    }
    setAdding(true)
    try {
      // Sân mới luôn ở trạng thái Đã khoá (backend mặc định); chỉ mở được khi cơ sở đã có bảng giá
      const created = await callApi('/api/chu-san/san', {
        method: 'POST',
        token,
        body: { maCoSo: branch.maCoSo, tenSan },
      })
      setCourts((prev) => [...prev, created])
      setNewName('')
      setError('')
      setSuccess(`Đã thêm ${created.tenSan} vào ${branch.tenCoSo}. Sân đang ở trạng thái Đã khoá, chỉ mở khoá được khi bảng giá phủ hết giờ hoạt động của cơ sở.`)
      setAddOpen(false)
      // Sân mới thuộc cơ sở khác với bộ lọc đang xem thì chuyển bộ lọc sang cơ sở đó để thấy ngay
      if (filterId !== 'all' && filterId !== addBranchId) setFilterId(addBranchId)
    } catch (err) {
      setAddError(describeApiError(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* Lọc sân theo cơ sở: mặc định hiển thị tất cả sân của mọi cơ sở */}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={filterId} onChange={changeFilter}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* Nút mở cửa sổ Thêm sân, nằm cạnh ô chọn cơ sở */}
        <button type="button" className="btn btn-primary" onClick={openAddDialog} disabled={themDuoc.length === 0}>
          <PlusIcon /> Thêm sân
        </button>
      </div>

      <section className="card table-card">
        <div className="table-scroll">
          <table className="table table-courts">
            <thead>
              <tr>
                <SortTh cols={courtCols} k="san" sel={sortSel} onSel={setSortSel}>Sân</SortTh>
                <SortTh cols={courtCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <SortTh cols={courtCols} k="gia" sel={sortSel} onSel={setSortSel}>Giá</SortTh>
                <SortTh cols={courtCols} k="trangThai" sel={sortSel} onSel={setSortSel}>Trạng thái</SortTh>
                <th className="th-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Đang tải danh sách sân...
                  </td>
                </tr>
              )}
              {!loading && courts.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Chưa có sân nào.
                  </td>
                </tr>
              )}
              {sortRows(courts, courtCols, sortSel).map((c) => {
                const coSoKhoa = isBranchBlocked(branchOf(c.maCoSo)) // cơ sở bị khoá → sân tự khoá theo
                const active = c.trangThai === 'active'
                const conKhach = busyCourts.has(c.maSan)
                const coTheXoa = c.trangThai !== 'active' && !conKhach
                let tieuDeXoa = 'Xoá sân (xoá mềm: ẩn khỏi chủ sân và khách, giữ lại trong lịch sử của khách)'
                if (c.trangThai === 'active') tieuDeXoa = 'Cần khoá sân trước khi xoá'
                else if (conKhach) tieuDeXoa = 'Sân còn khách đã đặt, chưa xoá được'
                return (
                  <tr key={c.maSan}>
                    <td>{c.tenSan}</td>
                    <td>{c.tenCoSo ?? branch?.tenCoSo}</td>
                    <td>{priceOf(c)}</td>
                    <td>
                      <span className={`status-badge ${active ? 'status-ok' : 'status-maint'}`}>{active ? (coSoKhoa ? 'Hoạt động (cơ sở bị khoá)' : 'Hoạt động') : 'Đã khoá'}</span>
                    </td>
                    <td className="td-center">
                      <div className="row-actions row-actions-center">
                        {/* Ổ khoá: sân hoạt động hiện ổ khoá mở (bấm để khoá sân); sân đã khoá hiện ổ khoá đóng (bấm để mở khoá) */}
                        <button
                          type="button"
                          className={`icon-btn icon-btn-wrench${active ? '' : ' is-on'}`}
                          onClick={() => toggleStatus(c)}
                          disabled={busyId === c.maSan || (coSoKhoa && !active)}
                          title={coSoKhoa && !active ? 'Cơ sở đang bị khoá nên chưa mở được sân' : active && busyCourts.has(c.maSan) ? 'Sân còn đơn đặt — huỷ đơn trước khi khoá' : active ? 'Khoá sân' : 'Sân đang khoá — bấm để mở khoá (cần bảng giá phủ hết giờ hoạt động của cơ sở)'}
                          aria-label={active ? 'Khoá sân' : 'Mở khoá sân'}
                        >
                          {active ? <LockOpenIcon /> : <LockClosedIcon />}
                        </button>
                        {/* Thùng rác đỏ: chỉ dùng được khi sân đã đóng và không còn khách đặt */}
                        <button
                          type="button"
                          className="icon-btn icon-btn-trash"
                          onClick={() => deleteCourt(c)}
                          disabled={!coTheXoa || busyId === c.maSan}
                          title={tieuDeXoa}
                          aria-label="Xoá sân"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <Dialog title="Thêm sân" width={460} onClose={() => !adding && setAddOpen(false)}>
          <form onSubmit={addCourt} noValidate>
            <label className="dialog-field">
              <span>Tên sân *</span>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} autoFocus />
            </label>
            <label className="dialog-field">
              <span>Cơ sở *</span>
              <select className="input" value={addBranchId} onChange={(e) => setAddBranchId(e.target.value)}>
                {themDuoc.map((b) => (
                  <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                    {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {addError && <p className="dialog-error">{addError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={adding || !branch}>
                {adding ? 'Đang thêm...' : 'Thêm sân'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Page>
  )
}
