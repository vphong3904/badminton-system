// Trang: Doanh thu (menu: revenue)
import { WEEKLY } from '../DungChung/hangSo.js'
import { BarChart, Filters, Page } from '../DungChung/ThanhPhan.jsx'

export default function TrangDoanhThu({ filters }) {
  const stats = [
    { label: 'Doanh thu', value: '2.840.000đ' },
    { label: 'Lượt đặt', value: '4' },
    { label: 'Tỉ lệ sử dụng', value: '68%' },
  ]

  return (
    <Page title="Báo cáo & phân tích doanh thu">
      <Filters {...filters} />

      <section className="card chart-card chart-card-flat">
        <h2>Xu hướng doanh thu mẫu</h2>
        <BarChart data={WEEKLY} />
      </section>

      <div className="stats stats-3">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <div className="stat-label stat-label-lg">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>
    </Page>
  )
}
