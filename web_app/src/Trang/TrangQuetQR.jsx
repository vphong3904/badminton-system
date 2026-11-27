// Trang: Quét QR nhận sân (menu: qr)
import { useState } from 'react'
import { Alert, Page } from '../DungChung/ThanhPhan.jsx'

export default function TrangQuetQR({ bookings, setBookings }) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState({ type: 'idle', message: 'Chưa có mã vé được kiểm tra.' })

  const handleSubmit = (e) => {
    e.preventDefault()
    const value = code.trim().toUpperCase()

    if (!value) {
      setResult({ type: 'error', message: 'Vui lòng nhập mã đặt sân.' })
      return
    }

    const booking = bookings.find((b) => b.code === value)

    if (!booking) {
      setResult({ type: 'error', message: `Không tìm thấy mã ${value}. Kiểm tra lại mã trên vé và thử lại.` })
      return
    }
    if (booking.status === 'Đã hủy') {
      setResult({ type: 'error', message: `Mã ${booking.code} đã bị hủy, không thể check-in.` })
      return
    }
    if (booking.status === 'Hoàn tất' || booking.checkedIn) {
      setResult({
        type: 'warning',
        message: `Mã ${booking.code} đã check-in trước đó (${booking.court} · ${booking.time}).`,
      })
      return
    }

    setBookings((prev) => prev.map((b) => (b.code === value ? { ...b, checkedIn: true } : b)))
    setResult({
      type: 'success',
      message: `Check-in thành công: ${booking.customer} · ${booking.court} · ${booking.time}.`,
    })
    setCode('')
  }

  return (
    <Page title="QR check-in tại quầy" subtitle="Camera không khả dụng trong bản demo. Nhập mã vé để kiểm tra và check-in.">
      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="label" htmlFor="booking-code">
          Mã đặt sân
        </label>
        <input
          id="booking-code"
          className="input"
          type="text"
          placeholder="Ví dụ: BD26082101"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary btn-lg">
          Kiểm tra &amp; check-in
        </button>
      </form>

      <Alert type={result.type}>{result.message}</Alert>
    </Page>
  )
}
