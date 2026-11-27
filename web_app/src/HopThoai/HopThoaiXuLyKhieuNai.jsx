// Hộp thoại (cửa sổ nổi)
import { useEffect, useMemo, useState } from 'react'
import { callApi, describeApiError, postMultipart } from '../DungChung/api.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'
import { toViDate, viTime } from '../DungChung/thoiGian.js'

// Cửa sổ Giải trình (khiếu nại của KHÁCH) và Kháng cáo (cảnh cáo của ADMIN).
// API có sẵn: POST /api/chu-san/khieu-nai/:maKhieuNai/phan-hoi (JSON { noiDung } 10–1000 ký tự, mỗi khiếu nại 1 lần, KHÔNG nhận ảnh)
//             POST /api/chu-san/khieu-nai/:maKhieuNai/khang-nghi (multipart: noiDung 10–1000 ký tự + anhBangChung 1–3 ảnh)
// Hạn 24 giờ do backend tính (hanPhanHoi / hanKhangNghi, quaHanPhanHoi / coTheKhangNghi), web không tự tính.
export default function HopThoaiXuLyKhieuNai({ mode, token, khieuNai, onClose, onDone }) {
  const isAppeal = mode === 'appeal'
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const pick = (e) => {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (!chosen) return
    if (!/^image\/(jpeg|png|webp)$/.test(chosen.type)) return setError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
    setError('')
    setFiles([chosen]) // chủ sân chỉ gửi 1 ảnh bằng chứng; chọn ảnh khác sẽ thay ảnh cũ
  }

  const submit = async (e) => {
    e.preventDefault()
    const noiDung = text.trim()
    if (noiDung.length < 10) return setError(isAppeal ? 'Nội dung kháng cáo tối thiểu 10 ký tự.' : 'Nội dung giải trình tối thiểu 10 ký tự.')
    if (noiDung.length > 1000) return setError('Nội dung tối đa 1000 ký tự.')
    if (isAppeal && files.length < 1) return setError('Vui lòng chọn 1 ảnh làm bằng chứng.')
    setBusy(true)
    setError('')
    try {
      if (isAppeal) {
        const body = new FormData()
        body.append('noiDung', noiDung)
        files.forEach((f) => body.append('anhBangChung', f))
        await postMultipart(token, `/api/chu-san/khieu-nai/${khieuNai.maKhieuNai}/khang-nghi`, body)
        onDone('Đã gửi kháng cáo lên quản trị viên. Kết quả sẽ được thông báo cho bạn.')
      } else {
        await callApi(`/api/chu-san/khieu-nai/${khieuNai.maKhieuNai}/phan-hoi`, { method: 'POST', token, body: { noiDung } })
        onDone('Đã gửi giải trình lên quản trị viên.')
      }
    } catch (err) {
      setError(describeApiError(err))
      setBusy(false)
    }
  }

  const han = isAppeal ? khieuNai.hanKhangNghi : khieuNai.hanPhanHoi
  return (
    <Dialog title={isAppeal ? 'Kháng cáo cảnh cáo' : 'Giải trình khiếu nại'} onClose={() => !busy && onClose()} width={520}>
      <form onSubmit={submit} noValidate>
        <div className="refund-summary">
          <div>
            Mã khiếu nại: <strong>{khieuNai.maKhieuNaiHienThi}</strong> · Đơn {khieuNai.maDon}
          </div>
          <div>
            {khieuNai.tenSan} · {toViDate(String(khieuNai.ngay).slice(0, 10))} · {String(khieuNai.gioBatDau).slice(0, 5)} – {String(khieuNai.gioKetThuc).slice(0, 5)}
          </div>
          {han && <div>Hạn gửi: <strong>{viTime(han)}</strong> (24 giờ kể từ lúc nhận)</div>}
        </div>
        <label className="dialog-field">
          <span>{isAppeal ? 'Nội dung kháng cáo *' : 'Giải trình *'}</span>
          <textarea className="input" rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={isAppeal ? 'Nhập lý do xin rút cảnh cáo (tối thiểu 10 ký tự)' : 'Nhập giải trình gửi quản trị viên (tối thiểu 10 ký tự, chỉ gửi được 1 lần)'} autoFocus />
        </label>
        {isAppeal && (
          <>
            <label className="dialog-field">
              <span>Ảnh bằng chứng * (1 ảnh)</span>
              <input className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} />
            </label>
            {previews.length > 0 && (
              <div className="complaint-previews">
                {previews.map((u, i) => (
                  <div key={u} className="complaint-preview">
                    <img src={u} alt={`Bằng chứng ${i + 1}`} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>Bỏ</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-two">
          <button type="button" className="dialog-ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button type="submit" className="dialog-primary" disabled={busy}>{busy ? 'Đang gửi...' : isAppeal ? 'Gửi kháng cáo' : 'Gửi giải trình'}</button>
        </div>
      </form>
    </Dialog>
  )
}
