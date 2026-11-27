import { useEffect, useRef, useState } from 'react'
import { callApi } from './api.js'
import { Y_TICKS } from './hangSo.js'
import { useAutoRefresh } from './hooks.js'
import { toViDate } from './thoiGian.js'
import { formatVnd } from './tienIch.js'

// Biểu tượng cho menu và tiêu đề trang (SVG, giúp người mới dùng web dễ phân biệt các trang)
const NAV_ICONS = {
  branches: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />,
  courts: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M12 5v14M3 12h18" />
    </>
  ),
  bookings: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 14l2 2 4-4" />
    </>
  ),
  refunds: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 8v8M9.5 14.5c.5 1 1.4 1.5 2.5 1.5 1.4 0 2.5-.7 2.5-1.8s-1-1.5-2.5-1.9-2.5-.8-2.5-1.9S10.6 8 12 8c1 0 1.9.5 2.4 1.3" />
    </>
  ),
  complaints: (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v4M12 14h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  pricing: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  reviews: <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3" />,
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  overview: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  profile: <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
}

export function NavIcon({ id, size = 18 }) {
  return (
    <svg className="nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[id] ?? NAV_ICONS.overview}
    </svg>
  )
}


// Biểu tượng cờ lê và thùng rác (SVG)
export const WrenchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

// Ổ khoá đóng (sân đang bị khoá) và ổ khoá mở (sân đang hoạt động)
export const LockClosedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

export const LockOpenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
)

export const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)


// ---- Sắp xếp bảng (dùng chung cho mọi bảng): ô "Sắp xếp" giống trang Quản lý đặt sân. Giá trị rỗng = thứ tự mặc định.
// cols: [{ key, label, type: 'text' | 'number' | 'date' | 'time', get: (dòng) => giá trị }]. Dòng thiếu giá trị luôn xếp cuối.
const SORT_NHAN = {
  text: [['asc', 'A → Z'], ['desc', 'Z → A']],
  number: [['asc', 'thấp → cao'], ['desc', 'cao → thấp']],
  date: [['desc', 'mới nhất → cũ nhất'], ['asc', 'cũ nhất → mới nhất']],
  time: [['asc', 'sớm → muộn'], ['desc', 'muộn → sớm']],
}

// Tiêu đề cột bấm để sắp xếp: bấm lần 1 = chiều đầu, bấm lần 2 = chiều ngược lại, bấm lần 3 = về mặc định. Bấm cột khác thì đổi sang cột đó.
export function SortTh({ cols, k, sel, onSel, children }) {
  const col = cols.find((c) => c.key === k)
  const [key, dir] = (sel || '').split('|')
  const active = key === k
  const [truoc, sau] = SORT_NHAN[col.type].map((x) => x[0])
  const bam = () => onSel(!active ? `${k}|${truoc}` : dir === truoc ? `${k}|${sau}` : '')
  return (
    <th className={col.num ? 'num' : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={bam} title="Bấm để sắp xếp theo cột này">
        {children}
        <span className={`sort-ind${active ? ' on' : ''}`} aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  )
}


/* ============================================================
   Component dùng chung
   ============================================================ */

export function Page({ subtitle, children }) {
  return (
    <>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {children}
      {/* <p className="note">
        Prototype tương tác · Dữ liệu, thanh toán, xác nhận và check-in chỉ là mô phỏng trong phiên hiện tại.
      </p> */}
    </>
  )
}


export function Alert({ type = 'idle', children }) {
  return (
    <div className={`alert alert-${type}`} role="status">
      {children}
    </div>
  )
}


export function Filters({ date, setDate, branch, setBranch, branches }) {
  return (
    <div className="filters">
      <label className="field">
        <span>Ngày</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Cơ sở</span>
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
    </div>
  )
}


export function BarChart({ data, max = 800, ticks = Y_TICKS, label = 'Biểu đồ doanh thu', onSelect }) {
  const [hover, setHover] = useState(null) // { i: cột, key: phần màu đang trỏ chuột }
  return (
    <div className="chart" role="img" aria-label={label}>
      <div className="chart-y">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          {ticks.map((t) => (
            <div key={t} className="chart-line" />
          ))}
        </div>
        <div className="chart-bars" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
          {data.map((d, i) => {
            const hoverPart = d.parts && hover?.i === i ? d.parts.find((p) => p.key === hover.key) : null
            return (
              <div
                key={d.day}
                className={`chart-col${i < 2 ? ' tip-left' : ''}${i >= data.length - 2 ? ' tip-right' : ''}${onSelect ? ' is-clickable' : ''}`}
                tabIndex={0}
                onMouseLeave={() => setHover(null)}
                onClick={onSelect ? () => onSelect(i) : undefined}
                onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i) } } : undefined}
              >
                {d.parts ? (
                  // Cột chồng: đỏ = chuyển khoản (dưới), xanh dương = tiền mặt (trên)
                  <div className="chart-bar chart-bar-stack" style={{ '--v': d.value / max }}>
                    {d.parts.map((p) => (
                      <div
                        key={p.key}
                        className={`chart-seg seg-${p.key}${hover?.i === i && hover.key === p.key ? ' is-hover' : ''}`}
                        style={{ flexGrow: p.amount, flexBasis: 0 }}
                        onMouseEnter={() => setHover({ i, key: p.key })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="chart-bar" style={{ '--v': d.value / max }} />
                )}
                <span className="chart-x">{d.day}</span>
                {d.tip && (
                  <div className="chart-tip" role="tooltip">
                    <strong>{d.tipTitle}</strong>
                    {d.tip.map(([k, v]) => (
                      <div key={k} className="chart-tip-row">
                        <span>{k}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                    {hoverPart && (
                      <div className={`chart-tip-row chart-tip-part seg-text-${hoverPart.key}`}>
                        <span>{hoverPart.label}</span>
                        <b>{formatVnd(hoverPart.amount)}</b>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


// Ô nhập ngày luôn hiển thị dạng ngày/tháng/năm (không phụ thuộc ngôn ngữ trình duyệt); bấm vào để mở lịch chọn ngày.
export function ViDateInput({ value, onChange, disabled = false, min, ariaLabel = 'Chọn ngày' }) {
  const ref = useRef(null)
  const openPicker = () => {
    const el = ref.current
    if (!el || disabled) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }
  return (
    <span className={`vi-date${disabled ? ' is-disabled' : ''}`}>
      <button type="button" className="vi-date-btn" onClick={openPicker} disabled={disabled} aria-label={ariaLabel}>
        <span>{value ? toViDate(value) : 'dd/mm/yyyy'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input ref={ref} className="vi-date-native" type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
    </span>
  )
}


/* ============================================================
   Chuông thông báo (góc phải trên cùng của mọi trang)
   API có sẵn: GET /api/thong-bao?trang=1&soLuong=20 (trả cacThongBao + soChuaDoc),
   PATCH /api/thong-bao/:maThongBao/da-doc, POST /api/thong-bao/da-doc-tat-ca
   ============================================================ */
export function NotificationBell({ user }) {
  const token = user.maTruyCap
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const tick = useAutoRefresh(30000) // kiểm tra thông báo mới mỗi 30 giây
  const box = useRef(null)

  useEffect(() => {
    let cancelled = false
    callApi('/api/thong-bao?trang=1&soLuong=20', { token })
      .then((data) => {
        if (cancelled) return
        setItems(data.cacThongBao ?? [])
        setUnread(Number(data.soChuaDoc ?? 0))
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, tick, reload])

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const markRead = async (n) => {
    if (n.daDoc) return
    try {
      await callApi(`/api/thong-bao/${n.maThongBao}/da-doc`, { method: 'PATCH', token })
      setReload((x) => x + 1)
    } catch (err) {
      setError(err.message)
    }
  }
  const markAll = async () => {
    try {
      await callApi('/api/thong-bao/da-doc-tat-ca', { method: 'POST', token })
      setReload((x) => x + 1)
    } catch (err) {
      setError(err.message)
    }
  }
  const fmt = (v) => (v ? `${toViDate(String(v).slice(0, 10))} ${String(v).slice(11, 16)}` : '—')

  return (
    <div className="bell" ref={box}>
      <button type="button" className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Thông báo" aria-expanded={open} title="Thông báo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Danh sách thông báo">
          <div className="bell-head">
            <strong>Thông báo</strong>
            {unread > 0 && (
              <button type="button" className="bell-readall" onClick={markAll}>
                Đánh dấu đã đọc tất cả
              </button>
            )}
          </div>
          {error && <p className="dialog-error">{error}</p>}
          <div className="bell-list">
            {items.length === 0 && !error && <p className="bell-empty">Chưa có thông báo nào.</p>}
            {items.map((n) => (
              <button type="button" key={n.maThongBao} className={`bell-item${n.daDoc ? '' : ' is-unread'}`} onClick={() => markRead(n)}>
                <span className="bell-title">{n.tieuDe}</span>
                <span className="bell-text">{n.noiDung}</span>
                <span className="bell-time">{fmt(n.ngayTao)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


export function PageBanner({ title, icon, right }) {
  return (
    <div className="page-banner">
      <h1 className="page-banner-title">
        {icon && (
          <span className="page-banner-icon">
            <NavIcon id={icon} size={28} />
          </span>
        )}
        {title}
      </h1>
      {right}
    </div>
  )
}


// Cửa sổ chung (nền mờ + hộp có tiêu đề và nút đóng)
// fit = cửa sổ chứa bảng: rộng và dài ra theo bảng (tối đa gần hết màn hình), chỉ phần bảng cuộn, tiêu đề + cột đầu được đóng băng
export function Dialog({ title, onClose, children, level = 1, width = 480, fit = false }) {
  return (
    <div className={`dialog-backdrop dialog-level-${level}`}>
      <div className={`dialog${fit ? ' dialog-fit' : ''}`} style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}


export function AuthShell({ title, subtitle, wide = false, children }) {
  return (
    <div className="auth-wrap">
      <div className={`card auth-card${wide ? ' auth-card-wide' : ''}`}>
        <div className="auth-banner" aria-hidden="true">
          <svg viewBox="0 0 440 150" preserveAspectRatio={wide ? 'xMidYMid meet' : 'xMidYMax slice'} xmlns="http://www.w3.org/2000/svg">
            <circle cx="372" cy="38" r="52" fill="rgba(255,255,255,0.10)" />
            <circle cx="60" cy="20" r="34" fill="rgba(255,255,255,0.08)" />
            {/* Sân cầu lông nhìn từ trên xuống */}
            <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2">
              <rect x="70" y="34" width="300" height="116" rx="4" />
              <line x1="220" y1="34" x2="220" y2="150" strokeWidth="3" stroke="rgba(255,255,255,0.85)" />
              <line x1="70" y1="62" x2="370" y2="62" />
              <line x1="70" y1="122" x2="370" y2="122" />
              <line x1="146" y1="34" x2="146" y2="150" />
              <line x1="294" y1="34" x2="294" y2="150" />
            </g>
            {/* Quả cầu */}
            <g transform="translate(300 56) rotate(-28)">
              <path d="M-9 -22 L9 -22 L5 -4 L-5 -4 Z" fill="#fff" opacity="0.95" />
              <circle cx="0" cy="2" r="7" fill="#f6c453" />
            </g>
          </svg>
        </div>
        <div className="auth-body">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}


// Ô nhập mật khẩu có nút hiện / ẩn mật khẩu (dùng cho Mật khẩu và Nhập lại mật khẩu)
export function PasswordInput({ id, value, onChange, onBlur, placeholder, invalid, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <span className="pw-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}
