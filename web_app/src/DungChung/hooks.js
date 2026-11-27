import { useEffect, useState } from 'react'
import { callApi } from './api.js'
import { nowMs } from './thoiGian.js'

// Tự tải lại dữ liệu mỗi 45 giây (trong khoảng 30–60 giây) để thông tin luôn mới; bỏ qua khi tab đang ẩn.
// Trang dùng kết quả (tick) làm một phần phụ thuộc của useEffect tải dữ liệu.
export function useAutoRefresh(ms = 45000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1)
    }, ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}


// Quản lý đặt sân: khách đặt từ app → Chưa thanh toán → khách gửi ảnh chuyển khoản → Đã thanh toán (xem ảnh, Xác nhận / Huỷ đơn đặt)
// → Xác nhận: Đã xác nhận (lên Lịch hoạt động). API có sẵn:
//   GET /api/chu-san/dat-san, GET /api/chu-san/dat-san/:maDatSan (lý do),
//   POST /api/chu-san/dat-san/:maDatSan/xac-nhan-thanh-toan (Xác nhận), POST .../tu-choi-thanh-toan (Huỷ đơn đặt + lý do)
// Giờ hiện tại (ms), tự cập nhật theo chu kỳ để các nút phụ thuộc thời gian tự ẩn
const DIALOG_TABLE_CSS = `
.dialog.dialog-fit { display: flex; flex-direction: column; max-width: min(1240px, 96vw) !important; max-height: 94vh; overflow: hidden; }
.dialog-fit .dialog-head, .dialog-fit .picker-hint, .dialog-fit .dialog-error, .dialog-fit .dialog-two { flex: none; }
.dialog-fit .dialog-table-scroll { flex: 1 1 auto; min-height: 0; max-height: none; overflow: auto; border: 1px solid #dfe6e2; border-radius: 8px; }
.dialog-fit .dialog-table-scroll .table { table-layout: auto; width: 100%; min-width: 0; border-collapse: separate; border-spacing: 0; }
.dialog-fit .dialog-table-scroll .table-collect { min-width: 1000px; }
.dialog-fit .dialog-table-scroll .table-detail { min-width: 820px; }
.dialog-fit .dialog-table-scroll .table-revenue-detail { min-width: 760px; }
.dialog-fit .dialog-table-scroll .table th, .dialog-fit .dialog-table-scroll .table td { padding: 10px 14px; white-space: nowrap; }
.dialog-fit .dialog-table-scroll thead th { position: sticky; top: 0; z-index: 3; background: #eef3f0; box-shadow: 0 1px 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll thead th:first-child, .dialog-fit .dialog-table-scroll tbody td:first-child, .dialog-fit .dialog-table-scroll tfoot td:first-child { position: sticky; left: 0; background: #fff; box-shadow: 1px 0 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll tbody td:first-child { z-index: 2; }
.dialog-fit .dialog-table-scroll thead th:first-child { z-index: 4; background: #eef3f0; }
.dialog-fit .dialog-table-scroll tfoot td { position: sticky; bottom: 0; z-index: 2; background: #f4f7f5; box-shadow: 0 -1px 0 #dfe6e2; }
.dialog-fit .dialog-table-scroll tfoot td:first-child { z-index: 4; }
.table-scroll .table th.num, .table-scroll .table td.num, .table-scroll .table-revenue-detail th.num, .table-scroll .table-revenue-detail td.num { text-align: right !important; font-variant-numeric: tabular-nums; }
.table th.num .th-sort { justify-content: flex-end; }
.table-revenue-detail tfoot td.num, .table-revenue-detail tbody td.num strong { font-weight: 700; }
`

export function useDialogTableCss() {
  useEffect(() => {
    if (document.getElementById('dialog-table-css')) return
    const el = document.createElement('style')
    el.id = 'dialog-table-css'
    el.textContent = DIALOG_TABLE_CSS
    document.head.appendChild(el)
  }, [])
}


export function useNow(ms) {
  const [now, setNow] = useState(() => nowMs())
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}


// Danh sách cơ sở của chủ sân (API có sẵn GET /api/chu-san/co-so). null = đang tải.
export function useBranches(token, isOwner) {
  const [branches, setBranches] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (!cancelled) setBranches(Array.isArray(data) ? data : data ? [data] : [])
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setBranches([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token])
  return { branches, error }
}


// Nhớ cơ sở được chọn cuối cùng (Lịch hoạt động) trên trình duyệt này
const LAST_BRANCH_KEY = 'lich-hoat-dong-co-so-cuoi'

export const readLastBranch = () => {
  try {
    return localStorage.getItem(LAST_BRANCH_KEY) || ''
  } catch {
    return ''
  }
}

export const saveLastBranch = (id) => {
  try {
    localStorage.setItem(LAST_BRANCH_KEY, String(id))
  } catch {
    /* bỏ qua */
  }
}
