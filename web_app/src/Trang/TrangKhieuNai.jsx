// Trang: Khiếu nại (menu: complaints)
import { useEffect, useState } from 'react'
import { callApi } from '../DungChung/api.js'
import { useAutoRefresh } from '../DungChung/hooks.js'
import { Alert, Page } from '../DungChung/ThanhPhan.jsx'
import { viTime } from '../DungChung/thoiGian.js'
import HopThoaiXuLyKhieuNai from '../HopThoai/HopThoaiXuLyKhieuNai.jsx'

// Trang Khiếu nại (giao diện kiểu tin nhắn): backend không có API khiếu nại riêng cho chủ sân, nên dùng API có sẵn
// GET /api/thong-bao (thông báo của chính chủ sân) và chỉ lấy thông báo có loaiThamChieu = 'complaint':
//  - complaint_received: khách khiếu nại (nội dung dạng "<tên khách> khiếu nại về đơn <mã đơn> (<cơ sở>)...")
//  - owner_warning / owner_banned: quản trị viên cảnh cáo / khoá tài khoản (kèm "lần vi phạm thứ N/3")
const MAX_WARNINGS = 3


function describeComplaint(n) {
  if (n.loai === 'owner_warning' || n.loai === 'owner_banned') {
    const m = /lần vi phạm thứ (\d)\//.exec(n.noiDung)
    const warnings = n.loai === 'owner_banned' ? MAX_WARNINGS : m ? Number(m[1]) : null
    return { key: 'admin', sender: 'Quản trị viên', fromAdmin: true, warnings, banned: n.loai === 'owner_banned' }
  }
  const m = /^(.+?) khiếu nại về đơn/.exec(n.noiDung)
  const sender = m ? m[1] : 'Khách hàng'
  return { key: `khach:${sender}`, sender, fromAdmin: false, warnings: null, banned: false }
}


const APPEAL_STATUS = { pending: 'đang chờ quản trị viên xem xét', accepted: 'quản trị viên đã chấp nhận (rút cảnh cáo)', rejected: 'quản trị viên đã từ chối', cancelled: 'đã thu hồi' }


export default function TrangKhieuNai({ user }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(isOwner)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [cases, setCases] = useState(new Map()) // GET /api/chu-san/khieu-nai: dữ liệu đầy đủ từng khiếu nại (hạn, giải trình, kháng nghị)
  const [dialog, setDialog] = useState(null) // { mode: 'explain' | 'appeal', khieuNai }
  const [notice, setNotice] = useState('')
  const [reloadCases, setReloadCases] = useState(0)
  const [casesFailed, setCasesFailed] = useState(false) // GET /api/chu-san/khieu-nai lỗi: trang vẫn dùng được, chỉ thiếu nút Giải trình / Kháng cáo
  const tick = useAutoRefresh() // tự tải lại mỗi 45 giây

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/khieu-nai?trangThai=all', { token })
      .then((data) => {
        if (cancelled) return
        setCases(new Map((Array.isArray(data) ? data : []).map((k) => [k.maKhieuNai, k])))
        setCasesFailed(false)
      })
      .catch(() => {
        // Không đẩy lỗi lên thanh đỏ của cả trang: danh sách khiếu nại lấy từ /api/thong-bao vẫn hiển thị bình thường.
        if (!cancelled) setCasesFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick, reloadCases])

  const merge = (prev, incoming) => {
    const map = new Map(prev.map((x) => [x.maThongBao, x]))
    incoming.forEach((x) => map.set(x.maThongBao, x))
    return [...map.values()].sort((a, b) => b.maThongBao - a.maThongBao)
  }

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/thong-bao?trang=1&soLuong=50', { token })
      .then((data) => {
        if (cancelled) return
        const complaints = data.cacThongBao.filter((n) => n.loaiThamChieu === 'complaint')
        setItems((prev) => merge(prev, complaints))
        setHasMore(data.cacThongBao.length >= 50)
        setError('')
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
  }, [isOwner, token, tick])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = page + 1
      const data = await callApi(`/api/thong-bao?trang=${next}&soLuong=50`, { token })
      setItems((prev) => merge(prev, data.cacThongBao.filter((n) => n.loaiThamChieu === 'complaint')))
      setHasMore(data.cacThongBao.length >= 50)
      setPage(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  // Gom thông báo thành các cuộc trò chuyện theo người gửi; quản trị viên luôn ở đầu danh sách
  const threads = []
  const byKey = new Map()
  items.forEach((n) => {
    const info = describeComplaint(n)
    if (!byKey.has(info.key)) {
      const thread = { key: info.key, sender: info.sender, fromAdmin: info.fromAdmin, messages: [], unread: 0, warnings: 0, banned: false }
      byKey.set(info.key, thread)
      threads.push(thread)
    }
    const t = byKey.get(info.key)
    t.messages.push(n) // items đã sắp mới → cũ
    if (!n.daDoc) t.unread += 1
    if (info.warnings) t.warnings = Math.max(t.warnings, info.warnings)
    if (info.banned) t.banned = true
  })
  threads.sort((a, b) => Number(b.fromAdmin) - Number(a.fromAdmin) || b.messages[0].maThongBao - a.messages[0].maThongBao)
  const current = threads.find((t) => t.key === selected) ?? null

  // Mở một cuộc trò chuyện: đánh dấu đã đọc bằng PATCH /api/thong-bao/:maThongBao/da-doc
  const openThread = (thread) => {
    setSelected(thread.key)
    thread.messages
      .filter((m) => !m.daDoc)
      .forEach((m) => {
        callApi(`/api/thong-bao/${m.maThongBao}/da-doc`, { method: 'PATCH', token })
          .then(() => setItems((prev) => prev.map((x) => (x.maThongBao === m.maThongBao ? { ...x, daDoc: true } : x))))
          .catch(() => {})
      })
  }

  // Phân loại theo bên gửi: thông báo từ khách (complaint_received) → Giải trình; từ quản trị viên (cảnh cáo) → Kháng cáo.
  // Cả hai chỉ mở được trong hạn 24 giờ do backend quyết định (quaHanPhanHoi / coTheKhangNghi).
  const renderActions = (m, fromAdmin) => {
    const k = m.maThamChieu ? cases.get(Number(m.maThamChieu)) : null
    if (!k) {
      return casesFailed ? <div className="complaint-state is-late">Chưa tải được chi tiết khiếu nại từ máy chủ nên tạm thời chưa dùng được Giải trình / Kháng cáo. Hệ thống sẽ tự thử lại sau ít phút.</div> : null
    }
    if (!fromAdmin) {
      if (k.phanHoiChuSan) return <div className="complaint-state">Bạn đã giải trình lúc {viTime(k.ngayPhanHoi)}: “{k.phanHoiChuSan}”</div>
      if (k.trangThai !== 'pending') return <div className="complaint-state">Khiếu nại đã được quản trị viên xử lý.</div>
      if (k.quaHanPhanHoi) return <div className="complaint-state is-late">Đã quá hạn giải trình (24 giờ).</div>
      return (
        <div className="complaint-actions">
          <button type="button" className="btn btn-sm btn-approve" onClick={() => { setNotice(''); setDialog({ mode: 'explain', khieuNai: k }) }}>Giải trình</button>
          <span className="complaint-hint">Hạn: {viTime(k.hanPhanHoi)}</span>
        </div>
      )
    }
    if (k.maKhangNghi) return <div className="complaint-state">Đã gửi kháng cáo: {APPEAL_STATUS[k.trangThaiKhangNghi] ?? k.trangThaiKhangNghi}.</div>
    if (k.trangThai !== 'upheld') return null
    if (!k.coTheKhangNghi) return <div className="complaint-state is-late">Không thể kháng cáo (đã quá hạn 24 giờ hoặc cảnh cáo không còn hiệu lực).</div>
    return (
      <div className="complaint-actions">
        <button type="button" className="btn btn-sm btn-reject" onClick={() => { setNotice(''); setDialog({ mode: 'appeal', khieuNai: k }) }}>Kháng cáo</button>
        <span className="complaint-hint">Hạn: {viTime(k.hanKhangNghi)}</span>
      </div>
    )
  }

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
      {dialog && (
        <HopThoaiXuLyKhieuNai
          mode={dialog.mode}
          token={token}
          khieuNai={dialog.khieuNai}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null)
            setNotice(msg)
            setReloadCases((n) => n + 1)
          }}
        />
      )}
      <section className="card chat-card">
        <aside className="chat-list">
          {loading && <p className="table-empty">Đang tải...</p>}
          {!loading && threads.length === 0 && <p className="table-empty">Chưa có khiếu nại nào.</p>}
          {threads.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`chat-item${current?.key === t.key ? ' is-active' : ''}${t.unread ? ' is-unread' : ''}`}
              onClick={() => openThread(t)}
            >
              <span className={`chat-avatar${t.fromAdmin ? ' is-admin' : ''}`}>{t.sender.trim().charAt(0).toUpperCase()}</span>
              <span className="chat-item-body">
                <span className="chat-item-top">
                  <strong>{t.sender}</strong>
                  <small>{new Date(t.messages[0].ngayTao).toLocaleDateString('vi-VN')}</small>
                </span>
                <span className="chat-item-preview">{t.messages[0].noiDung}</span>
              </span>
              {t.unread > 0 && <span className="chat-badge">{t.unread}</span>}
            </button>
          ))}
          {hasMore && (
            <button type="button" className="btn btn-ghost btn-sm chat-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải...' : 'Xem thêm tin cũ hơn'}
            </button>
          )}
        </aside>

        <div className="chat-detail">
          {!current && <p className="chat-placeholder">Chọn một người gửi ở bên trái để xem nội dung khiếu nại.</p>}
          {current && (
            <>
              <div className="chat-detail-head">
                <span className={`chat-avatar${current.fromAdmin ? ' is-admin' : ''}`}>{current.sender.trim().charAt(0).toUpperCase()}</span>
                <strong>{current.sender}</strong>
                {/* Tin từ quản trị viên: chỉ số cảnh cáo, đủ 3 lần thì tài khoản bị khoá */}
                {current.fromAdmin && (
                  <span className={`warn-badge${current.banned ? ' is-banned' : ''}`}>
                    {current.banned ? `Cảnh cáo ${MAX_WARNINGS}/${MAX_WARNINGS} · Tài khoản đã bị khoá` : `Cảnh cáo ${current.warnings}/${MAX_WARNINGS}`}
                  </span>
                )}
              </div>
              <div className="chat-messages">
                {[...current.messages].reverse().map((m) => (
                  <div key={m.maThongBao} className="chat-bubble">
                    <strong>{m.tieuDe}</strong>
                    <p>{m.noiDung}</p>
                    <small>{viTime(m.ngayTao)}</small>
                    {renderActions(m, current.fromAdmin)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </Page>
  )
}
