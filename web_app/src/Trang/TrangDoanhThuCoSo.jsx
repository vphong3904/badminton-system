// Trang: Doanh thu của cơ sở (menu: overview)
import { useEffect, useState } from 'react'
import { callApi } from '../DungChung/api.js'
import { useAutoRefresh } from '../DungChung/hooks.js'
import { isBranchBlocked } from '../DungChung/nghiepVu.js'
import { Alert, BarChart, Page, ViDateInput } from '../DungChung/ThanhPhan.jsx'
import { WEEK_LABELS, addDays, mondayOf, mondayOfWeekValue, pad2, toViDate, todayISO, weekValueOf } from '../DungChung/thoiGian.js'
import { formatVnd } from '../DungChung/tienIch.js'
import HopThoaiChiTietDoanhThu from '../HopThoai/HopThoaiChiTietDoanhThu.jsx'

// Chia thang đo biểu đồ (đơn vị: nghìn đồng) thành tối đa 8 khoảng đẹp
function niceScale(maxVal) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
  const step = steps.find((s) => Math.ceil(maxVal / s) <= 8) ?? steps[steps.length - 1]
  const max = Math.max(step, Math.ceil(maxVal / step) * step)
  const ticks = []
  for (let t = max; t >= 0; t -= step) ticks.push(t)
  return { max, ticks }
}


export default function TrangDoanhThuCoSo({ user, onNavigate }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'

  const [date, setDate] = useState(todayISO())
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO())) // Thứ 2 của tuần đang xem
  const [year, setYear] = useState(() => Number(todayISO().slice(0, 4))) // năm đang xem ở dạng "Tháng"
  const [branches, setBranches] = useState([])
  const [maCoSo, setMaCoSo] = useState(null)
  const [activeCourts, setActiveCourts] = useState(0)
  const [revenueByDay, setRevenueByDay] = useState({}) // ngày → { revenue, count } của tuần đang xem
  const [revenueByMonth, setRevenueByMonth] = useState({}) // tháng (1-12) → { revenue, count } của năm đang xem
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây
  const [range, setRange] = useState('week') // biểu đồ xem theo tuần hoặc tháng
  const [dayStats, setDayStats] = useState(null) // { count, revenue } của ngày đã chọn (null = đang tải)
  const [detail, setDetail] = useState(null) // cửa sổ chi tiết doanh thu các sân: { tuNgay, denNgay, title }
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')

  // Danh sách cơ sở: API có sẵn GET /api/chu-san/co-so
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((list) => {
        if (cancelled) return
        const all = Array.isArray(list) ? list : []
        setBranches(all)
        setMaCoSo((prev) => prev ?? (all.find((b) => !isBranchBlocked(b)) ?? all[0])?.maCoSo ?? null)
        if (all.length === 0) setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])

  // Số sân hoạt động + doanh thu của tuần (hoặc của cả năm khi xem theo tháng): API có sẵn
  // GET /api/chu-san/san?maCoSo= và GET /api/chu-san/bao-cao/doanh-thu?maCoSo=&tuNgay=&denNgay= | &nam=
  useEffect(() => {
    if (!isOwner || !maCoSo) return
    let cancelled = false
    async function load() {
      try {
        const loc = range === 'week' ? `tuNgay=${weekStart}&denNgay=${addDays(weekStart, 6)}` : `nam=${year}`
        const [cacSan, doanhThu] = await Promise.all([
          callApi(`/api/chu-san/san?maCoSo=${maCoSo}`, { token }),
          callApi(`/api/chu-san/bao-cao/doanh-thu?maCoSo=${maCoSo}&${loc}`, { token }),
        ])
        if (cancelled) return
        setActiveCourts(cacSan.filter((c) => c.trangThai === 'active').length)
        if (range === 'week') {
          const byDay = {}
          doanhThu.theoNgay.forEach((r) => {
            const cash = Number(r.doanhThuNgoaiHeThong ?? 0)
            byDay[String(r.ngay).slice(0, 10)] = { revenue: Number(r.doanhThu), count: Number(r.soLuotDat), cash, transfer: Math.max(0, Number(r.doanhThu) - cash) }
          })
          setRevenueByDay(byDay)
        } else {
          const byMonth = {}
          doanhThu.theoThang.forEach((r) => {
            const cash = Number(r.doanhThuNgoaiHeThong ?? 0)
            byMonth[Number(r.thang)] = { revenue: Number(r.doanhThu), count: Number(r.soLuotDat), cash, transfer: Math.max(0, Number(r.doanhThu) - cash) }
          })
          setRevenueByMonth(byMonth)
        }
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
  }, [isOwner, token, maCoSo, range, weekStart, year, tick])

  // Lịch đặt + doanh thu của ngày đã chọn: GET /api/chu-san/dat-san?ngay= (đếm đơn confirmed + completed)
  // và GET /api/chu-san/bao-cao/doanh-thu?tuNgay=&denNgay= (cùng một ngày)
  useEffect(() => {
    if (!isOwner || !maCoSo || !date) return
    let cancelled = false
    Promise.all([
      callApi(`/api/chu-san/dat-san?ngay=${date}&maCoSo=${maCoSo}&soDong=200`, { token }),
      callApi(`/api/chu-san/bao-cao/doanh-thu?maCoSo=${maCoSo}&tuNgay=${date}&denNgay=${date}`, { token }),
    ])
      .then(([datSan, doanhThu]) => {
        if (cancelled) return
        const paid = datSan.cacDon.filter((d) => d.trangThai === 'confirmed' || d.trangThai === 'completed')
        // Tiền mặt = đơn chủ sân tạo bằng nút "Tạo đơn" (thu ngoài hệ thống); chuyển khoản = phần còn lại (khách thanh toán qua hệ thống, đã trừ tiền hoàn)
        const cash = Number(doanhThu.tongCong.doanhThuNgoaiHeThong ?? 0)
        const revenue = Number(doanhThu.tongCong.doanhThu)
        setDayStats({ count: paid.length, revenue, cash, transfer: Math.max(0, revenue - cash) })
      })
      .catch((err) => {
        if (!cancelled) {
          setDayStats({ count: 0, revenue: 0 })
          setError(err.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, maCoSo, date, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  const show = (v) => (loading ? '...' : v)
  const stats = [
    { label: 'Lịch đặt trong ngày', value: show(dayStats?.count ?? '...') },
    { label: 'Tổng doanh thu trong ngày', value: show(dayStats ? formatVnd(dayStats.revenue) : '...') },
    { label: 'Sân hoạt động', value: show(activeCourts) },
    { label: 'Doanh thu chuyển khoản', value: show(dayStats ? formatVnd(dayStats.transfer) : '...') },
    { label: 'Doanh thu tiền mặt', value: show(dayStats ? formatVnd(dayStats.cash) : '...') },
  ]

  // Dữ liệu cột. Backend không lưu lịch sử số sân hoạt động nên "Sân hoạt động" là số sân đang hoạt động hiện tại.
  const chartData =
    range === 'week'
      ? WEEK_LABELS.map((label, i) => {
          const iso = addDays(weekStart, i)
          const r = revenueByDay[iso] ?? { revenue: 0, count: 0, cash: 0, transfer: 0 }
          return {
            day: label,
            value: Math.round(r.revenue / 1000),
            parts: [
              { key: 'transfer', label: 'Doanh thu chuyển khoản', amount: r.transfer },
              { key: 'cash', label: 'Doanh thu tiền mặt', amount: r.cash },
            ],
            tipTitle: `${label} · ${toViDate(iso)}`,
            tip: [
              ['Lịch đặt trong ngày', r.count],
              ['Tổng doanh thu trong ngày', formatVnd(r.revenue)],
              ['Sân hoạt động', activeCourts],
            ],
          }
        })
      : Array.from({ length: 12 }, (_, i) => {
          const r = revenueByMonth[i + 1] ?? { revenue: 0, count: 0, cash: 0, transfer: 0 }
          return {
            day: `Th${i + 1}`,
            value: Math.round(r.revenue / 1000),
            parts: [
              { key: 'transfer', label: 'Doanh thu chuyển khoản', amount: r.transfer },
              { key: 'cash', label: 'Doanh thu tiền mặt', amount: r.cash },
            ],
            tipTitle: `Tháng ${i + 1}/${year}`,
            tip: [
              ['Tổng doanh thu tháng', formatVnd(r.revenue)],
              ['Tổng lịch đặt', r.count],
              ['Sân hoạt động (nhiều nhất)', activeCourts],
            ],
          }
        })
  const scale = niceScale(Math.max(0, ...chartData.map((w) => w.value)))
  const weekEnd = addDays(weekStart, 6)
  // Bấm cột: xem theo tuần → đúng ngày của cột; xem theo tháng → cả tháng của cột
  const openDetail = (i) => {
    if (range === 'week') {
      const iso = addDays(weekStart, i)
      setDetail({ tuNgay: iso, denNgay: iso, title: `${WEEK_LABELS[i]} ${toViDate(iso)}` })
    } else {
      const m = i + 1
      const lastDay = new Date(year, m, 0).getDate()
      setDetail({ tuNgay: `${year}-${pad2(m)}-01`, denNgay: `${year}-${pad2(m)}-${pad2(lastDay)}`, title: `Tháng ${m}/${year}` })
    }
  }

  return (
    <Page subtitle="">
      {error && <Alert type="error">{error}</Alert>}

      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Ngày: </span>
          <ViDateInput
            value={date}
            ariaLabel="Chọn ngày"
            onChange={(v) => {
              setDate(v)
              if (v) {
                setWeekStart(mondayOf(v))
                setYear(Number(v.slice(0, 4)))
              }
            }}
          />
        </label>
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={maCoSo ?? ''} onChange={(e) => setMaCoSo(Number(e.target.value))} disabled={branches.length < 2}>
            {branches.map((b) => (
              <option key={b.maCoSo} value={b.maCoSo} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stats stats-5">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <section className="card chart-card">
        <div className="chart-head">
          <h2>
            {range === 'week'
              ? `Doanh thu theo tuần (${toViDate(weekStart)} – ${toViDate(weekEnd)}) · nghìn đồng`
              : `Doanh thu theo tháng năm ${year} · nghìn đồng`}
          </h2>
          <div className="actions">
            {range === 'week' ? (
              <div className="period-picker">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước">
                  ‹
                </button>
                <input
                  type="week"
                  value={weekValueOf(weekStart)}
                  onChange={(e) => {
                    const monday = mondayOfWeekValue(e.target.value)
                    if (monday) setWeekStart(monday)
                  }}
                  aria-label="Chọn tuần"
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau">
                  ›
                </button>
              </div>
            ) : (
              <div className="period-picker">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year - 1)} aria-label="Năm trước">
                  ‹
                </button>
                <strong className="period-year">{year}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setYear(year + 1)} aria-label="Năm sau">
                  ›
                </button>
              </div>
            )}
            <button type="button" className={`btn btn-sm ${range === 'week' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('week')}>
              Tuần
            </button>
            <button type="button" className={`btn btn-sm ${range === 'month' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange('month')}>
              Tháng
            </button>
          </div>
        </div>
        <div className="chart-legend" aria-label="Chú thích màu cột doanh thu">
          <span className="chart-legend-item">
            <i className="chart-legend-box seg-transfer" /> Doanh thu chuyển khoản
          </span>
          <span className="chart-legend-item">
            <i className="chart-legend-box seg-cash" /> Doanh thu tiền mặt
          </span>
        </div>
        <BarChart data={chartData} max={scale.max} ticks={scale.ticks} onSelect={maCoSo ? openDetail : undefined} label={range === 'week' ? 'Biểu đồ doanh thu theo tuần (bấm vào cột để xem chi tiết từng sân)' : 'Biểu đồ doanh thu theo tháng (bấm vào cột để xem chi tiết từng sân)'} />
        <p className="hint">Bấm vào một cột để xem doanh thu từng sân của {range === 'week' ? 'ngày' : 'tháng'} đó.</p>
      </section>

      {detail && maCoSo && (
        <HopThoaiChiTietDoanhThu
          token={token}
          maCoSo={maCoSo}
          tenCoSo={branches.find((b) => b.maCoSo === maCoSo)?.tenCoSo ?? ''}
          tuNgay={detail.tuNgay}
          denNgay={detail.denNgay}
          title={detail.title}
          onClose={() => setDetail(null)}
        />
      )}
    </Page>
  )
}
