// Trang: Đánh giá của khách hàng (menu: reviews)
import { useEffect, useState } from 'react'
import { callApi, describeApiError } from '../DungChung/api.js'
import { useAutoRefresh, useBranches } from '../DungChung/hooks.js'
import { isBranchBlocked } from '../DungChung/nghiepVu.js'
import { Alert, Page, SortTh } from '../DungChung/ThanhPhan.jsx'
import { sortRows } from '../DungChung/tienIch.js'
import HopThoaiPhanHoiDanhGia from '../HopThoai/HopThoaiPhanHoiDanhGia.jsx'

// Phản hồi dài hơn mức này (độ dài phản hồi mẫu đầu tiên) thì chỉ hiện phần đầu kèm nút "Mở rộng"
const REPLY_PREVIEW_LEN = 50


export default function TrangDanhGiaKhachHang({ user }) {
  const [sortSel, setSortSel] = useState('')
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const { branches, error: branchError } = useBranches(token, isOwner)
  const [branchId, setBranchId] = useState('all') // mặc định hiển thị tất cả cơ sở
  const [stars, setStars] = useState('Tất cả')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [replyTarget, setReplyTarget] = useState(null) // đánh giá đang mở cửa sổ phản hồi
  const [expanded, setExpanded] = useState(new Set()) // các phản hồi dài đang mở rộng
  const tick = useAutoRefresh()

  // API có sẵn GET /api/chu-san/danh-gia?maCoSo=&soSao=&trang=&soLuong=50 (tất cả cơ sở nếu bỏ maCoSo)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    async function load() {
      try {
        const all = []
        for (let page = 1; page <= 10; page += 1) {
          const loc = branchId === 'all' ? '' : `&maCoSo=${branchId}`
          const data = await callApi(`/api/chu-san/danh-gia?trang=${page}&soLuong=50${loc}`, { token })
          all.push(...(data.cacDanhGia ?? []))
          if ((data.cacDanhGia ?? []).length < 50) break
        }
        if (cancelled) return
        setReviews(all.filter((r) => !r.biAn)) // đánh giá bị quản trị viên ẩn thì không hiển thị
        setError('')
      } catch (err) {
        if (!cancelled) setError(describeApiError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isOwner, token, branchId, tick])

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.soSao, 0) / reviews.length : 0
  const visible = reviews.filter((r) => stars === 'Tất cả' || r.soSao === Number(stars))
  const fmt = (iso) => new Date(iso).toLocaleDateString('vi-VN')
  const reviewCols = [
    { key: 'khach', label: 'Khách hàng', type: 'text', get: (r) => r.tenKhach },
    { key: 'sao', label: 'Đánh giá', type: 'number', get: (r) => r.soSao },
    { key: 'coSo', label: 'Cơ sở', type: 'text', get: (r) => r.tenCoSo },
    { key: 'ngay', label: 'Ngày', type: 'date', get: (r) => r.ngayTao },
  ]

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  return (
    <Page>
      {(error || branchError) && <Alert type="error">{error || branchError}</Alert>}
      <div className="filters filters-inline">
        <label className="field-inline">
          <span>Cơ sở: </span>
          <select className="input" value={branchId} onChange={(e) => { setLoading(true); setBranchId(e.target.value) }}>
            <option value="all">Hiển thị tất cả cơ sở</option>
            {(branches ?? []).map((b) => (
              <option key={b.maCoSo} value={String(b.maCoSo)} disabled={isBranchBlocked(b)}>
                {b.tenCoSo}{isBranchBlocked(b) ? ' (đã khoá)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field-inline">
          <span>Điểm trung bình: </span>
          <strong>{average.toFixed(1)} / 5</strong>
        </div>
        <div className="field-inline">
          <span>Số đánh giá: </span>
          <strong>{reviews.length}</strong>
        </div>
        <label className="field-inline">
          <span>Lọc theo sao: </span>
          <select className="input" value={stars} onChange={(e) => setStars(e.target.value)}>
            <option>Tất cả</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card table-card">
        <div className="table-scroll scroll-y">
          <table className="table table-reviews">
            <thead>
              <tr>
                <SortTh cols={reviewCols} k="khach" sel={sortSel} onSel={setSortSel}>Khách hàng</SortTh>
                <SortTh cols={reviewCols} k="sao" sel={sortSel} onSel={setSortSel}>Đánh giá</SortTh>
                <SortTh cols={reviewCols} k="coSo" sel={sortSel} onSel={setSortSel}>Cơ sở</SortTh>
                <th>Bình luận của khách hàng</th>
                <SortTh cols={reviewCols} k="ngay" sel={sortSel} onSel={setSortSel}>Ngày</SortTh>
                <th>Phản hồi của chủ sân</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Đang tải đánh giá...
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Chưa có đánh giá nào.
                  </td>
                </tr>
              )}
              {!loading && sortRows(visible, reviewCols, sortSel).map((r) => (
                <tr key={r.maDanhGia}>
                  <td>{r.tenKhach}</td>
                  <td>
                    <span className="stars" aria-label={`${r.soSao} sao`}>
                      {'★'.repeat(r.soSao)}
                      {'☆'.repeat(5 - r.soSao)}
                    </span>
                  </td>
                  <td>{r.tenCoSo}</td>
                  <td>{r.noiDung}</td>
                  <td>{fmt(r.ngayTao)}</td>
                  <td className="reply-cell">
                    {r.phanHoiChuSan ? (
                      <>
                        <span className="reply-text">
                          {expanded.has(r.maDanhGia) || r.phanHoiChuSan.length <= REPLY_PREVIEW_LEN
                            ? r.phanHoiChuSan
                            : `${r.phanHoiChuSan.slice(0, REPLY_PREVIEW_LEN).trimEnd()}…`}
                        </span>
                        <span className="reply-actions">
                          {r.phanHoiChuSan.length > REPLY_PREVIEW_LEN && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(r.maDanhGia)) next.delete(r.maDanhGia)
                                  else next.add(r.maDanhGia)
                                  return next
                                })
                              }
                            >
                              {expanded.has(r.maDanhGia) ? 'Thu gọn' : 'Mở rộng'}
                            </button>
                          )}
                          <button type="button" className="link-btn" onClick={() => setReplyTarget(r)}>
                            Sửa
                          </button>
                        </span>
                      </>
                    ) : (
                      <button type="button" className="btn btn-sm btn-reply" onClick={() => setReplyTarget(r)}>
                        Phản hồi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {replyTarget && (
        <HopThoaiPhanHoiDanhGia
          token={token}
          review={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSaved={(maDanhGia, noiDung) => {
            setReviews((prev) => prev.map((r) => (r.maDanhGia === maDanhGia ? { ...r, phanHoiChuSan: noiDung } : r)))
            setReplyTarget(null)
          }}
        />
      )}
    </Page>
  )
}
