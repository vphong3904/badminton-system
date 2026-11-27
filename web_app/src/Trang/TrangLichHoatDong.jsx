// Trang: Lịch hoạt động (menu: calendar)
import { useEffect, useState } from 'react'
import { callApi } from '../DungChung/api.js'
import { readLastBranch, saveLastBranch, useAutoRefresh, useBranches } from '../DungChung/hooks.js'
import { isBranchBlocked } from '../DungChung/nghiepVu.js'
import { Alert, Page, ViDateInput } from '../DungChung/ThanhPhan.jsx'
import { SLOT_MIN, cut5, slotTimes, toMinutes, todayISO } from '../DungChung/thoiGian.js'
import HopThoaiKhoaSan from '../HopThoai/HopThoaiKhoaSan.jsx'
import HopThoaiTaoDonDat from '../HopThoai/HopThoaiTaoDonDat.jsx'

// Đổi "HH:mm" thành vị trí cột (mỗi cột = 30 phút, cột 0 = 06:00)
function slotIndex(time, openMin) {
  return Math.floor((toMinutes(time) - openMin) / SLOT_MIN)
}


// Dựng các ô của một sân: mỗi thanh (đơn đặt hoặc khoá sân) đi từ giờ bắt đầu đến giờ kết thúc
// (không gồm mốc kết thúc) gộp thành MỘT ô; mốc kết thúc vẫn trống để khách khác đặt tiếp từ đó.
function buildCourtCells(bars, total, openMin) {
  const sorted = [...bars].sort((a, b) => slotIndex(a.gioBatDau, openMin) - slotIndex(b.gioBatDau, openMin))
  const cells = []
  let i = 0
  while (i < total) {
    const dat = sorted.find((b) => Math.max(slotIndex(b.gioBatDau, openMin), 0) === i && slotIndex(b.gioKetThuc, openMin) > i)
    if (dat) {
      const end = Math.min(slotIndex(dat.gioKetThuc, openMin), total)
      cells.push({ key: `dat-${i}`, span: end - i, dat })
      i = end
    } else {
      cells.push({ key: `trong-${i}`, span: 1, dat: null })
      i += 1
    }
  }
  return cells
}


export default function TrangLichHoatDong({ user }) {
  const [date, setDate] = useState(todayISO) // mặc định là ngày hiện tại
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState(readLastBranch) // mặc định: cơ sở được chọn cuối cùng
  const [courts, setCourts] = useState([]) // tất cả sân của cơ sở đó
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null) // 'lock' | 'create' | null
  const [reloadKey, setReloadKey] = useState(0)
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  // Đơn đã thanh toán của ngày đang xem (API có sẵn GET /api/chu-san/dat-san): confirmed (đã đặt) và completed (hoàn tất)
  // → vẽ thanh vàng từ giờ bắt đầu đến giờ kết thúc kèm tên khách. Đổi ngày thì tải lại.
  const [donTheoNgay, setDonTheoNgay] = useState([])
  const [khoaTheoNgay, setKhoaTheoNgay] = useState([]) // khung giờ khoá bảo trì của ngày đang xem (GET /api/chu-san/khoa-san)
  // Cơ sở đang xem: cơ sở chọn cuối cùng nếu còn tồn tại, không thì cơ sở đầu tiên
  // Cơ sở bị khoá không chọn được; mặc định lấy cơ sở chọn cuối (nếu không bị khoá) hoặc cơ sở dùng được đầu tiên
  const dungDuoc = (branches ?? []).filter((b) => !isBranchBlocked(b))
  const branch = dungDuoc.find((b) => String(b.maCoSo) === branchId) ?? dungDuoc[0] ?? null
  const maCoSoLich = branch?.maCoSo
  const chooseBranch = (id) => {
    setBranchId(id)
    saveLastBranch(id)
  }

  // Giờ trên lịch theo giờ mở cửa – đóng cửa của cơ sở
  const openMin = branch ? toMinutes(cut5(branch.gioMoCua)) : 0
  const closeMin = branch ? toMinutes(cut5(branch.gioDongCua)) : 0
  const gioList = branch && closeMin > openMin ? slotTimes(openMin, closeMin - SLOT_MIN) : []
  const gioCuoi = branch ? cut5(branch.gioDongCua) : ''

  useEffect(() => {
    if (!isOwner || !maCoSoLich) return
    let cancelled = false
    callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSoLich}&soDong=200`, { token })
      .then((data) => {
        if (!cancelled) {
          // Ô vàng: đơn đã xác nhận (confirmed/completed). Ô đỏ: đơn đã huỷ sau khi khách đã thanh toán
          setDonTheoNgay(
            data.cacDon.filter((d) => (d.trangThai === 'confirmed' || d.trangThai === 'completed') && !(d.nguon === 'owner' && d.trangThaiThu !== 'paid')),
          )
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    callApi(`/api/chu-san/khoa-san?tuNgay=${encodeURIComponent(`${date} 00:00`)}&denNgay=${encodeURIComponent(`${date} 23:59`)}`, { token })
      .then((data) => {
        if (!cancelled) setKhoaTheoNgay(data)
      })
      .catch(() => {
        if (!cancelled) setKhoaTheoNgay([])
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSoLich, date, tick, reloadKey])

  const tatCaDon = donTheoNgay.map((d) => ({
    maSan: d.maSan,
    maDon: d.maDatSan,
    tenKhach: d.tenKhach,
    gioBatDau: d.gioBatDau.slice(0, 5),
    gioKetThuc: d.gioKetThuc.slice(0, 5),
  }))
  const khoaBars = khoaTheoNgay.map((k) => ({
    maSan: k.maSan,
    maDon: `khoa-${k.maKhoa}`,
    khoa: true,
    lyDo: k.lyDo,
    tenKhach: 'Khoá bảo trì',
    gioBatDau: k.thoiGianBatDau.slice(11, 16),
    gioKetThuc: k.thoiGianKetThuc.slice(11, 16),
  }))
  // Lịch chỉ hiển thị đơn đang giữ sân (không vẽ đơn đã huỷ để khách khác đặt được khung giờ đó)
  const datSanTheoNgay = [...tatCaDon, ...khoaBars]

  // Sang ngày mới thì ô ngày tự đổi theo (chỉ khi đang xem đúng ngày hôm qua)
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
  }, [])

  useEffect(() => {
    if (!isOwner || branches === null) return
    if (!maCoSoLich) {
      setCourts([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const cacSan = await callApi(`/api/chu-san/san?maCoSo=${maCoSoLich}`, { token })
        if (cancelled) return
        setCourts(cacSan)
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
  }, [isOwner, token, branches, maCoSoLich, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const canOpenDialog = branch && courts.length > 0 && gioList.length > 0
  const afterChange = (msg) => {
    setReloadKey((n) => n + 1)
    if (msg) setNotice(msg)
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      {branches !== null && branches.length > 0 && dungDuoc.length === 0 && <Alert type="warning">Tất cả cơ sở của bạn đang bị khoá nên chưa xem được lịch hoạt động.</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput value={date} onChange={(v) => v && setDate(v)} ariaLabel="Chọn ngày" />
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branch ? String(branch.maCoSo) : ''} onChange={(e) => chooseBranch(e.target.value)}>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}
                {isBranchBlocked(b) ? ' (bị khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* Chú thích màu trạng thái */}
        <div className="legend" aria-label="Chú thích màu">
          <span className="legend-item">
            <i className="legend-box legend-free" /> Trống
          </span>
          <span className="legend-item">
            <i className="legend-box legend-booked" /> Đã đặt
          </span>
          <span className="legend-item">
            <i className="legend-box legend-locked" /> Khoá bảo trì
          </span>
        </div>
        <div className="calendar-actions">
          <button type="button" className="btn btn-primary" disabled={!canOpenDialog} onClick={() => { setNotice(''); setDialog('create') }}>
            Tạo đơn
          </button>
          <button type="button" className="btn btn-lock" disabled={!canOpenDialog} onClick={() => { setNotice(''); setDialog('lock') }}>
            Khoá khung giờ
          </button>
        </div>
      </div>

      <section className="card table-card">
        {/* Kéo thanh trượt ngang để xem các khung giờ; cột tên sân đứng yên */}
        <div className="table-scroll matrix-scroll">
          <table className="matrix matrix-wide" style={{ minWidth: 140 + (gioList.length + 1) * 47 }}>
            <thead>
              <tr>
                <th>Sân</th>
                {gioList.map((h) => (
                  <th key={h} className="time-head">
                    <span className="time-label">{h}</span>
                  </th>
                ))}
                {/* Cột cuối cho mốc giờ đóng cửa: dải màu nền chạy liên tục đến hết ô này */}
                <th className="time-head time-head-end">
                  <span className="time-label">{gioCuoi}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={gioList.length + 2} className="table-empty">
                    Đang tải danh sách sân...
                  </td>
                </tr>
              )}
              {!loading && courts.length === 0 && (
                <tr>
                  <td colSpan={gioList.length + 2} className="table-empty">
                    Cơ sở này chưa có sân nào.
                  </td>
                </tr>
              )}
              {courts.map((c) => (
                <tr key={c.maSan} className={c.trangThai === 'maintenance' ? 'court-closed' : undefined}>
                  <th scope="row">{c.tenSan}</th>
                  {buildCourtCells(
                    datSanTheoNgay.filter((d) => d.maSan === c.maSan),
                    gioList.length,
                    openMin,
                  ).map((cell) =>
                    cell.dat ? (
                      <td
                        key={cell.key}
                        colSpan={cell.span}
                        className={`slot-cell slot-booked${cell.dat.khoa ? ' slot-locked' : ''}`}
                        title={
                          cell.dat.khoa
                            ? `Khoá bảo trì: ${cell.dat.gioBatDau} – ${cell.dat.gioKetThuc}${cell.dat.lyDo ? ` (${cell.dat.lyDo})` : ''}`
                            : `${cell.dat.tenKhach} (${cell.dat.maDon}): ${cell.dat.gioBatDau} – ${cell.dat.gioKetThuc}`
                        }
                      >
                        <span className="slot-name">{cell.dat.tenKhach}</span>
                        <span className="slot-time">
                          {cell.dat.gioBatDau} – {cell.dat.gioKetThuc}
                        </span>
                      </td>
                    ) : (
                      <td key={cell.key} className="slot-cell" />
                    ),
                  )}
                  <td className="slot-end" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialog === 'lock' && canOpenDialog && (
        <HopThoaiKhoaSan
          token={token}
          courts={courts}
          branch={branch}
          defaultDate={date}
          onClose={() => setDialog(null)}
          onChanged={afterChange}
        />
      )}
      {dialog === 'create' && canOpenDialog && (
        <HopThoaiTaoDonDat
          token={token}
          courts={courts}
          branch={branch}
          defaultDate={date}
          onClose={() => setDialog(null)}
          onCreated={(msg) => {
            setDialog(null)
            afterChange(msg)
          }}
        />
      )}
    </Page>
  )
}
