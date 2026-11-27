// Trang: Quản lý bảng giá (menu: pricing)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { daysText, findClassOverlap, findPriceGaps, readPriceMeta, restoreEntries, rowsFromEntries, toRow, validatePricing, writePriceMeta } from '../DungChung/bangGia.js'
import { ALL_BRANCHES_ID } from '../DungChung/hangSo.js'
import { isBranchBlocked, prepareHoursChange } from '../DungChung/nghiepVu.js'
import { Alert, Dialog, Page, PlusIcon, SortTh, WrenchIcon } from '../DungChung/ThanhPhan.jsx'
import { cut5, toMinutes } from '../DungChung/thoiGian.js'
import { formatVnd, sortRows } from '../DungChung/tienIch.js'
import HopThoaiThemKhungGia from '../HopThoai/HopThoaiThemKhungGia.jsx'

export default function TrangQuanLyBangGia({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [branches, setBranches] = useState([]) // các cơ sở của chủ sân
  const [selectedId, setSelectedId] = useState(ALL_BRANCHES_ID) // cơ sở đang xem ("all" = tất cả cơ sở)
  const [data, setData] = useState({}) // maCoSo → { branch: { maCoSo, tenCoSo, gioMoCua, gioDongCua }, entries }
  const [loading, setLoading] = useState(isOwner)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dialog, setDialog] = useState(null) // { mode, ten, lockName, initial }
  const [hoursDialog, setHoursDialog] = useState(null) // { maCoSo, open, close, error, busy }
  const [reloadKey, setReloadKey] = useState(0)

  // Danh sách cơ sở
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((resp) => {
        if (cancelled) return
        const list = Array.isArray(resp) ? resp : resp ? [resp] : []
        setBranches(list)
        setSelectedId((cur) => (cur === ALL_BRANCHES_ID || list.some((b) => String(b.maCoSo) === cur) ? cur : ALL_BRANCHES_ID))
        if (list.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ type: 'error', message: describeApiError(err) })
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])

  // Bảng giá của các cơ sở đang xem (một cơ sở, hoặc tất cả)
  const visibleIds = selectedId === ALL_BRANCHES_ID ? branches.map((b) => String(b.maCoSo)) : [selectedId]
  const visibleKey = visibleIds.join(',')
  useEffect(() => {
    if (!isOwner || !visibleKey) return
    let cancelled = false
    setLoading(true)
    Promise.all(
      visibleKey.split(',').map((id) =>
        callApi(`/api/chu-san/co-so/${id}/bang-gia`, { token }).then(
          (d) => ({
            id,
            value: {
              branch: { maCoSo: d.maCoSo, tenCoSo: d.tenCoSo, gioMoCua: d.gioMoCua, gioDongCua: d.gioDongCua },
              entries: restoreEntries((d.khungGias ?? []).map(toRow), readPriceMeta(d.maCoSo)),
            },
          }),
          (err) => ({ id, error: describeApiError(err) }),
        ),
      ),
    ).then((list) => {
      if (cancelled) return
      const next = {}
      const errors = []
      list.forEach((r) => {
        if (r.value) next[r.id] = r.value
        else errors.push(r.error)
      })
      setData(next)
      if (errors.length > 0) setResult({ type: 'error', message: errors[0] })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, visibleKey, reloadKey])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const showAll = selectedId === ALL_BRANCHES_ID
  // Cơ sở bị khoá: bảng giá giữ nguyên nhưng không sửa được
  const idKhoa = (id) => isBranchBlocked(branches.find((b) => String(b.maCoSo) === String(id)))
  const themDuoc = branches.filter((b) => !isBranchBlocked(b))
  const blocksGoc = visibleIds.map((id) => data[id]).filter(Boolean) // các cơ sở đang hiển thị (đã tải xong)
  // Sắp xếp: theo cơ sở (khi xem tất cả cơ sở), hoặc theo sự kiện / khung giờ / giá trong từng cơ sở
  const pricingCols = [
    ...(showAll ? [{ key: 'coSo', label: 'Cơ sở', type: 'text', get: (b) => b.branch.tenCoSo }] : []),
    { key: 'ten', label: 'Tên sự kiện', type: 'text', get: (g) => g.ten },
    { key: 'thu', label: 'Thứ', type: 'number', get: (g) => Math.min(...g.items.map((i) => i.days[0])) },
    { key: 'gio', label: 'Khung giờ', type: 'time', get: (g) => String(Math.min(...g.items.map((i) => toMinutes(i.time[0])))).padStart(4, '0') },
    { key: 'gia', label: 'Giá', type: 'number', get: (g) => Math.min(...g.items.map((i) => Number(i.gia))) },
  ]
  const blocks = sortRows(blocksGoc, pricingCols.filter((c) => c.key === 'coSo'), sortSel) // sắp xếp cơ sở
  const single = !showAll ? data[selectedId] : null

  const changeBranch = (e) => {
    setSelectedId(e.target.value)
    setData({})
    setResult(null)
  }

  const setEntriesOf = (id, entries) => setData((d) => (d[id] ? { ...d, [id]: { ...d[id], entries } } : d))

  // Dựng lại bảng của một cơ sở từ khung giá backend vừa trả về (sau khi sửa / xóa)
  const applyServerRows = (id, savedRows, nextEntries) => {
    writePriceMeta(id, nextEntries, [])
    setEntriesOf(String(id), restoreEntries(savedRows.map(toRow), readPriceMeta(id)))
  }

  // Gửi bảng giá của một cơ sở lên database (PUT thay toàn bộ bảng giá của cơ sở đó)
  const putRows = (idCoSo, list) =>
    callApi(`/api/chu-san/co-so/${idCoSo}/bang-gia`, {
      method: 'PUT',
      token,
      body: {
        khungGias: list.map((r) => ({
          gioBatDau: r.gioBatDau,
          gioKetThuc: r.gioKetThuc,
          giaTheoThu: r.gia.map((g, i) => ({ thu: i + 1, giaKhachVangLai: Number(g), giaKhachCoDinh: Number(g) })),
        })),
      },
    })

  // Nút Thêm / Lưu trong cửa sổ: ghi thẳng vào database, trả về thông báo lỗi (hoặc null nếu thành công)
  const submitEntry = async ({ id, maCoSo: idCoSo, ten, time, days, gia }) => {
    if (idKhoa(idCoSo)) return 'Cơ sở đang bị khoá nên không sửa được bảng giá.'
    const [s, e] = time

    if (!id) {
      // Thêm khung mới: backend (POST thêm 1 khung) chặn mọi khung trùng giờ mà không biết thứ, nên web ghép lại
      // cả bảng giá (khung cũ + khung mới) rồi lưu bằng PUT: khác loại thứ (T2–T6 / T7–CN) thì được trùng giờ.
      try {
        const cur = await callApi(`/api/chu-san/co-so/${idCoSo}/bang-gia`, { token })
        const open = cut5(cur.gioMoCua)
        const close = cut5(cur.gioDongCua)
        const cu = restoreEntries((cur.khungGias ?? []).map(toRow), readPriceMeta(idCoSo))
        const moiId = `moi-${Date.now()}`
        const next = [...cu, { id: moiId, ten, time, days, gia: String(Number(gia)) }]
        const trung = findClassOverlap(next, moiId)
        if (trung) return trung
        const message = validatePricing(rowsFromEntries(next), open, close)
        if (message) return message
        const saved = await putRows(idCoSo, rowsFromEntries(next))
        applyServerRows(idCoSo, saved, next)
        if (showAll || String(idCoSo) === selectedId) {
          setReloadKey((n) => n + 1) // tải lại để hiện khung mới
        } else {
          // thêm vào cơ sở khác với cơ sở đang xem: chuyển sang xem cơ sở đó
          setSelectedId(String(idCoSo))
          setData({})
        }
        setResult({ type: 'success', message: `Đã thêm khung giờ ${s}–${e} (${daysText(days)}) vào ${cur.tenCoSo}.` })
        return null
      } catch (err) {
        return describeApiError(err)
      }
    }

    // Sửa một dòng giá: cập nhật bảng giá của cơ sở rồi lưu (PUT)
    const block = data[String(idCoSo)]
    if (!block) return 'Chưa tải xong bảng giá của cơ sở này.'
    const open = cut5(block.branch.gioMoCua)
    const close = cut5(block.branch.gioDongCua)
    const next = [...block.entries.filter((x) => x.id !== id), { id, ten, time, days, gia }]
    const trung = findClassOverlap(next, id)
    if (trung) return trung
    const message = validatePricing(rowsFromEntries(next), open, close)
    if (message) return message
    try {
      const saved = await putRows(idCoSo, rowsFromEntries(next))
      applyServerRows(idCoSo, saved, next)
      setResult({ type: 'success', message: 'Đã lưu khung giờ vào database.' })
      return null
    } catch (err) {
      return describeApiError(err)
    }
  }

  // Xóa một dòng giá: lưu ngay vào database
  const removeEntry = async (block, item) => {
    if (idKhoa(block.branch.maCoSo)) return setResult({ type: 'error', message: 'Cơ sở đang bị khoá nên không sửa được bảng giá.' })
    const idCoSo = block.branch.maCoSo
    const next = block.entries.filter((x) => x.id !== item.id)
    if (next.length === 0) {
      return setResult({ type: 'error', message: `${block.branch.tenCoSo}: cơ sở cần có ít nhất 1 khung giá, không thể xóa khung cuối cùng.` })
    }
    if (!window.confirm(`Xóa khung giờ ${item.time[0]}–${item.time[1]} (${daysText(item.days)}) của ${block.branch.tenCoSo}? Thay đổi được lưu ngay vào database.`)) return
    const rows = rowsFromEntries(next)
    const message = validatePricing(rows, cut5(block.branch.gioMoCua), cut5(block.branch.gioDongCua))
    if (message) return setResult({ type: 'error', message })
    setSaving(true)
    try {
      const saved = await putRows(idCoSo, rows)
      applyServerRows(idCoSo, saved, next)
      setResult({ type: 'success', message: `Đã xóa khung giờ ${item.time[0]}–${item.time[1]} (${daysText(item.days)}).` })
    } catch (err) {
      setResult({ type: 'error', message: describeApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  // Sửa giờ mở cửa / đóng cửa của một cơ sở: PUT /api/chu-san/co-so/:maCoSo (API có sẵn, nhận đủ thông tin cơ sở)
  // nên gửi lại nguyên thông tin cơ sở, chỉ đổi hai trường giờ. Backend từ chối nếu còn khung giá nằm ngoài giờ mới.
  const saveHours = async () => {
    const { maCoSo: idCoSo, open: newOpen, close: newClose } = hoursDialog
    if (idKhoa(idCoSo)) return setHoursDialog((d) => ({ ...d, error: 'Cơ sở đang bị khoá nên không sửa được giờ mở cửa.' }))
    if (!newOpen || !newClose) return setHoursDialog((d) => ({ ...d, error: 'Vui lòng chọn giờ mở cửa và giờ đóng cửa.' }))
    if (newOpen >= newClose) return setHoursDialog((d) => ({ ...d, error: 'Giờ đóng cửa phải sau giờ mở cửa.' }))
    const full = branches.find((b) => b.maCoSo === idCoSo)
    if (!full) return
    const body = {
      tenCoSo: full.tenCoSo,
      diaChi: full.diaChi,
      tinhThanh: full.tinhThanh,
      quanHuyen: full.quanHuyen,
      soDienThoai: full.soDienThoai,
      linkBanDo: full.linkBanDo,
      gioMoCua: newOpen,
      gioDongCua: newClose,
      soPhutDatToiThieu: Number(full.soPhutDatToiThieu),
    }
    if (full.moTa) body.moTa = full.moTa
    setHoursDialog((d) => ({ ...d, busy: true, error: '' }))
    let prep = { restore: null, reminder: '' }
    try {
      prep = await prepareHoursChange(token, full, newOpen, newClose)
      const updated = await callApi(`/api/chu-san/co-so/${idCoSo}`, { method: 'PUT', token, body })
      setBranches((prev) => prev.map((b) => (b.maCoSo === idCoSo ? { ...b, ...updated } : b)))
      setReloadKey((n) => n + 1) // tải lại bảng giá (có thể đã được cắt cho vừa giờ mới)
      setData((d) => (d[String(idCoSo)] ? { ...d, [String(idCoSo)]: { ...d[String(idCoSo)], branch: { ...d[String(idCoSo)].branch, gioMoCua: newOpen, gioDongCua: newClose } } } : d))
      setHoursDialog(null)
      setResult({ type: prep.reminder ? 'warning' : 'success', message: `Đã lưu giờ mở cửa của ${full.tenCoSo}: ${newOpen}–${newClose}.${prep.reminder ? ` ${prep.reminder}` : ''}` })
    } catch (err) {
      if (prep.restore) await prep.restore()
      setHoursDialog((d) => ({ ...d, busy: false, error: describeApiError(err) }))
    }
  }

  // Sắp xếp trong từng cơ sở: thứ (thứ đầu tiên trước) → khung giờ. Các cơ sở giữ thứ tự cơ sở.
  // Các dòng liền nhau cùng tên sự kiện được gộp chung một ô sự kiện.
  const groupsOf = (entries) => {
    const sorted = [...entries].sort(
      (a, b) => a.days[0] - b.days[0] || a.days.length - b.days.length || toMinutes(a.time[0]) - toMinutes(b.time[0]) || toMinutes(a.time[1]) - toMinutes(b.time[1]),
    )
    const groups = []
    sorted.forEach((it) => {
      const last = groups[groups.length - 1]
      if (last && last.ten === (it.ten || '')) last.items.push(it)
      else groups.push({ ten: it.ten || '', items: [it] })
    })
    return sortRows(groups, pricingCols.filter((c) => c.key !== 'coSo'), sortSel)
  }

  const openEdit = (block, item) =>
    setDialog({
      mode: 'edit',
      ten: item.ten,
      lockName: false,
      defaultBranchId: block.branch.maCoSo,
      initial: { id: item.id, ten: item.ten, time: item.time, days: item.days, gia: String(item.gia) },
    })

  const colCount = showAll ? 6 : 5

  const dsKhoa = branches.filter((b) => isBranchBlocked(b) && (showAll || String(b.maCoSo) === selectedId))
  return (
    <Page>
      {dsKhoa.length > 0 && (
        <Alert type="warning">
          Cơ sở {dsKhoa.map((b) => b.tenCoSo).join(', ')} đang bị khoá: bảng giá được giữ nguyên nhưng không sửa được.
        </Alert>
      )}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={selectedId} onChange={changeBranch} disabled={branches.length === 0}>
            {branches.length === 0 && <option value="">Chưa có cơ sở</option>}
            {branches.length > 0 && <option value={ALL_BRANCHES_ID}>Hiển thị tất cả cơ sở</option>}
            {branches.map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {single && (
          <div className="field-inline">
            <span>Giờ mở cửa: </span>
            <strong>
              {cut5(single.branch.gioMoCua)}–{cut5(single.branch.gioDongCua)}
            </strong>
            {/* Cờ lê: sửa giờ mở cửa / đóng cửa của cơ sở đang chọn */}
            <button
              type="button"
              className="icon-btn icon-btn-wrench"
              title="Sửa giờ mở cửa của cơ sở"
              aria-label="Sửa giờ mở cửa của cơ sở"
              disabled={idKhoa(single.branch.maCoSo)}
              onClick={() => setHoursDialog({ maCoSo: single.branch.maCoSo, open: cut5(single.branch.gioMoCua), close: cut5(single.branch.gioDongCua), error: '', busy: false })}
            >
              <WrenchIcon />
            </button>
          </div>
        )}
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-pricing">
            <thead>
              <tr>
                {showAll && <SortTh cols={pricingCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>}
                <SortTh cols={pricingCols} k="ten" sel={sortSel} onSel={setSortSel}>Tên sự kiện</SortTh>
                <SortTh cols={pricingCols} k="gio" sel={sortSel} onSel={setSortSel}>Khung giờ</SortTh>
                <SortTh cols={pricingCols} k="thu" sel={sortSel} onSel={setSortSel}>Thứ</SortTh>
                <SortTh cols={pricingCols} k="gia" sel={sortSel} onSel={setSortSel}>Giá</SortTh>
                <th className="th-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Đang tải bảng giá...
                  </td>
                </tr>
              )}
              {!loading && branches.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="table-empty">
                    Tài khoản chưa có cơ sở. Hãy thêm cơ sở ở trang Quản lý cơ sở.
                  </td>
                </tr>
              )}
              {!loading &&
                blocks.map((block) => {
                  const groups = groupsOf(block.entries)
                  const total = block.entries.length
                  if (groups.length === 0) {
                    return (
                      <tr key={`empty-${block.branch.maCoSo}`}>
                        {showAll && <td className="event-cell">{block.branch.tenCoSo}</td>}
                        <td colSpan={colCount - (showAll ? 1 : 0)} className="table-empty">
                          Cơ sở chưa có khung giá nào. Bấm &quot;Thêm khung giờ&quot; để tạo.
                        </td>
                      </tr>
                    )
                  }
                  let first = true
                  return groups.map((g) =>
                    g.items.map((it, idx) => {
                      const showBranchCell = showAll && first
                      first = false
                      return (
                        <tr key={`${block.branch.maCoSo}-${it.id}`} className={idx === 0 ? 'group-first' : undefined}>
                          {showBranchCell && (
                            <td rowSpan={total} className="event-cell">
                              <div className="event-name">{block.branch.tenCoSo}</div>
                              <div className="cell-sub">
                                {cut5(block.branch.gioMoCua)}–{cut5(block.branch.gioDongCua)}
                              </div>
                              {/* Cờ lê: sửa giờ mở cửa của cơ sở này */}
                              <button
                                type="button"
                                className="icon-btn icon-btn-wrench"
                                title="Sửa giờ mở cửa của cơ sở"
                                aria-label="Sửa giờ mở cửa của cơ sở"
                                disabled={idKhoa(block.branch.maCoSo)}
                                onClick={() =>
                                  setHoursDialog({ maCoSo: block.branch.maCoSo, open: cut5(block.branch.gioMoCua), close: cut5(block.branch.gioDongCua), error: '', busy: false })
                                }
                              >
                                <WrenchIcon />
                              </button>
                            </td>
                          )}
                          {idx === 0 && (
                            <td rowSpan={g.items.length} className="event-cell">
                              <div className="event-name">{g.ten || <span className="muted">Giờ cố định</span>}</div>
                              {/* Dấu + xanh lá: thêm khung giờ + thứ + giá vào cùng sự kiện */}
                              <button
                                type="button"
                                className="icon-btn icon-btn-plus"
                                title="Thêm khung giờ vào sự kiện này"
                                aria-label="Thêm khung giờ vào sự kiện này"
                                disabled={idKhoa(block.branch.maCoSo)}
                                onClick={() => setDialog({ mode: 'add', ten: g.ten, lockName: true, defaultBranchId: block.branch.maCoSo, initial: { ten: g.ten } })}
                              >
                                <PlusIcon />
                              </button>
                            </td>
                          )}
                          <td>
                            <span className="pill pill-sm">{it.time[0]}</span> - <span className="pill pill-sm">{it.time[1]}</span>
                          </td>
                          <td>{daysText(it.days)}</td>
                          <td>{formatVnd(Number(it.gia))}/giờ</td>
                          <td className="td-center">
                            <div className="row-actions row-actions-center">
                              {/* Cờ lê xanh dương: sửa giá, thứ hoặc thời gian */}
                              <button type="button" className="icon-btn icon-btn-wrench" title="Sửa" aria-label="Sửa" onClick={() => openEdit(block, it)} disabled={saving || idKhoa(block.branch.maCoSo)}>
                                <WrenchIcon />
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeEntry(block, it)} disabled={saving || idKhoa(block.branch.maCoSo)}>
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }),
                  )
                })}
            </tbody>
          </table>
        </div>

        <div className="pricing-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => setDialog({ mode: 'add', ten: '', lockName: false, defaultBranchId: showAll ? themDuoc[0]?.maCoSo : Number(selectedId), initial: null })}
            disabled={themDuoc.length === 0 || loading || (!showAll && idKhoa(selectedId))}
          >
            Thêm khung giờ
          </button>
        </div>
      </section>

      {!loading &&
        blocks.map((block) => {
          const gaps = findPriceGaps(rowsFromEntries(block.entries), cut5(block.branch.gioMoCua), cut5(block.branch.gioDongCua))
          return gaps.length > 0 ? (
            <Alert key={`gap-${block.branch.maCoSo}`} type="error">
              {block.branch.tenCoSo}: chưa có giá cho khoảng giờ {gaps.join(', ')}. Khách sẽ không đặt được các khung này.
            </Alert>
          ) : null
        })}
      {result && <Alert type={result.type}>{result.message}</Alert>}

      {hoursDialog && (
        <Dialog
          title={`Giờ mở cửa - ${branches.find((b) => b.maCoSo === hoursDialog.maCoSo)?.tenCoSo ?? ''}`}
          width={460}
          onClose={() => !hoursDialog.busy && setHoursDialog(null)}
        >
          <div className="date-pair">
            <label className="dialog-field">
              <span>Giờ mở cửa:</span>
              <input className="input" type="time" value={hoursDialog.open} onChange={(e) => setHoursDialog((d) => ({ ...d, open: e.target.value, error: '' }))} />
            </label>
            <label className="dialog-field">
              <span>Giờ đóng cửa:</span>
              <input className="input" type="time" value={hoursDialog.close} onChange={(e) => setHoursDialog((d) => ({ ...d, close: e.target.value, error: '' }))} />
            </label>
          </div>
          <p className="picker-hint">Thu hẹp giờ (mở muộn hơn / đóng sớm hơn): các khung giá được tự cắt cho vừa giờ mới. Mở rộng giờ (mở sớm hơn / đóng muộn hơn): giữ nguyên khung giá, bạn cần bổ sung bảng giá cho phần mới và phải khoá tất cả sân của cơ sở trước.</p>
          {hoursDialog.error && <p className="dialog-error">{hoursDialog.error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setHoursDialog(null)} disabled={hoursDialog.busy}>
              Hủy
            </button>
            <button type="button" className="dialog-primary" onClick={saveHours} disabled={hoursDialog.busy}>
              {hoursDialog.busy ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </Dialog>
      )}

      {dialog && (
        <HopThoaiThemKhungGia
          key={dialog.initial?.id ?? `new-${dialog.ten}-${dialog.defaultBranchId}`}
          branches={themDuoc}
          defaultBranchId={dialog.defaultBranchId}
          mode={dialog.mode}
          initial={dialog.initial}
          lockName={dialog.lockName}
          onSubmit={submitEntry}
          onClose={() => setDialog(null)}
        />
      )}
    </Page>
  )
}
