// Trang: Cài đặt (menu: settings)
import { useState } from 'react'
import { Alert, Page } from '../DungChung/ThanhPhan.jsx'

export default function TrangCaiDat({ cancelHours, setCancelHours }) {
  const [value, setValue] = useState(String(cancelHours))
  const [result, setResult] = useState(null)

  const handleSave = (e) => {
    e.preventDefault()
    const n = Number(value)
    if (value.trim() === '' || Number.isNaN(n) || n < 0) {
      setResult({ type: 'error', message: 'Số giờ phải là số không âm.' })
      return
    }
    setCancelHours(n)
    setResult({ type: 'success', message: `Đã lưu: cho phép hủy trước giờ chơi ${n} giờ.` })
  }

  return (
    <Page title="Cài đặt hệ thống & hủy lịch">
      <form className="card form-card" onSubmit={handleSave}>
        <label className="label" htmlFor="cancel-hours">
          Cho phép hủy trước giờ chơi (giờ)
        </label>
        <input
          id="cancel-hours"
          className="input"
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="field-hint">Lịch đã hoàn tất hoặc đã hủy không thể hủy thêm.</p>
        <button type="submit" className="btn btn-primary btn-lg btn-flush">
          Lưu quy định mẫu
        </button>
      </form>

      <Alert>Tất cả cấu hình và thao tác chỉ tồn tại trong phiên xem hiện tại.</Alert>
      {result && <Alert type={result.type}>{result.message}</Alert>}
    </Page>
  )
}
