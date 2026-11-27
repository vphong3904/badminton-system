// Hộp thoại (cửa sổ nổi)
import { useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'

// Cửa sổ phản hồi đánh giá. API có sẵn: PATCH /api/chu-san/danh-gia/:maDanhGia/phan-hoi { noiDung } (ghi đè được phản hồi cũ).
export default function HopThoaiPhanHoiDanhGia({ token, review, onClose, onSaved }) {
  const [text, setText] = useState(review.phanHoiChuSan ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const noiDung = text.trim()
    // Phản hồi là tuỳ chọn: để trống thì chỉ đóng cửa sổ (nếu đang có phản hồi cũ mà xoá trắng thì gỡ phản hồi đó)
    if (!noiDung && !review.phanHoiChuSan) return onClose()
    setBusy(true)
    setError('')
    try {
      if (!noiDung) {
        await callApi(`/api/chu-san/danh-gia/${review.maDanhGia}/phan-hoi`, { method: 'DELETE', token, body: {} })
        return onSaved(review.maDanhGia, null)
      }
      await callApi(`/api/chu-san/danh-gia/${review.maDanhGia}/phan-hoi`, { method: 'PATCH', token, body: { noiDung } })
      onSaved(review.maDanhGia, noiDung)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Phản hồi đánh giá" width={520} onClose={() => !busy && onClose()}>
      <p className="picker-hint">
        {review.tenKhach} · {'★'.repeat(review.soSao)}
        {'☆'.repeat(5 - review.soSao)} · {review.tenCoSo}
      </p>
      <p className="reply-quote">{review.noiDung}</p>
      <label className="dialog-field">
        <span>Phản hồi của chủ sân (không bắt buộc)</span>
        <textarea className="input dlg-textarea" rows={5} placeholder="Nhập phản hồi cho khách..." value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>
          Đóng
        </button>
        <button type="button" className="dialog-primary" onClick={submit} disabled={busy}>
          {busy ? 'Đang gửi...' : text.trim() ? 'Gửi phản hồi' : review.phanHoiChuSan ? 'Gỡ phản hồi' : 'Xong'}
        </button>
      </div>
    </Dialog>
  )
}
