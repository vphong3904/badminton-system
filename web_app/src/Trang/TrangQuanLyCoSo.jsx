// Trang: Quản lý cơ sở (menu: branches)
import { useEffect, useMemo, useRef, useState } from 'react'
import { callApi, describeApiError, fileUrl, uploadBranchImage } from '../DungChung/api.js'
import { BRANCH_DISTRICTS, BRANCH_PROVINCE } from '../DungChung/hangSo.js'
import { useAutoRefresh } from '../DungChung/hooks.js'
import { checkMapLink, prepareHoursChange } from '../DungChung/nghiepVu.js'
import { Alert, Dialog, Page, PlusIcon } from '../DungChung/ThanhPhan.jsx'
import { cut5 } from '../DungChung/thoiGian.js'
import { formatVnd } from '../DungChung/tienIch.js'
import { onlyDigits } from '../DungChung/xacThuc.js'

/* ============================================================
   Quản lý cơ sở
   API có sẵn: GET /api/chu-san/co-so (danh sách), POST /api/chu-san/co-so (thêm cơ sở),
   POST /api/chu-san/co-so/:maCoSo/anh (ảnh bìa, multipart trường tepAnh)
   ============================================================ */

const BRANCH_STATUS = {
  hidden: { label: 'Chưa hiển thị cho khách', className: 'status-wait', hint: 'Cần có ít nhất 1 sân hoạt động và bảng giá thì cơ sở mới hiện cho khách đặt.' },
  active: { label: 'Đang hoạt động', className: 'status-ok', hint: '' },
  closed: { label: 'Đã khoá', className: 'status-maint', hint: 'Cơ sở đã bị khoá: khách không đặt được và các sân, bảng giá, lịch của cơ sở này không dùng được. Bấm "Mở khoá" để hoạt động lại.' },
  locked: { label: 'Bị khoá', className: 'status-maint', hint: 'Cơ sở bị quản trị viên khoá, vui lòng liên hệ quản trị viên.' },
}

const MIN_BOOKING_OPTIONS = [60, 90, 120]

const EMPTY_BRANCH_FORM = {
  tenCoSo: '',
  diaChi: '',
  tinhThanh: '',
  quanHuyen: '',
  soDienThoai: '',
  zalo: '',
  linkBanDo: '', // link Google Maps do chủ sân dán
  moTa: '',
  gioMoCua: '06:00',
  gioDongCua: '22:00',
  soPhutDatToiThieu: '60',
}

// Số liên hệ giống backend: di động 10 số (03/05/07/08/09) hoặc số bàn 11 số, bắt đầu bằng 0 (chấp nhận +84 / khoảng trắng)
const CONTACT_PHONE_RE = /^0([35789]\d{8}|2\d{9})$/

function normalizeContactPhone(raw) {
  let digits = String(raw ?? '').replace(/[^0-9]/g, '')
  if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2)
  if (digits && !digits.startsWith('0')) digits = `0${digits}`
  return digits
}


// Trả về { body } hợp lệ gửi API hoặc { error } (luật khớp validator của backend)
function validateBranchForm(f) {
  const text = (v) => String(v ?? '').trim()
  const tenCoSo = text(f.tenCoSo)
  const diaChi = text(f.diaChi)
  const tinhThanh = text(f.tinhThanh)
  const quanHuyen = text(f.quanHuyen)
  const zalo = text(f.zalo)
  const moTa = String(f.moTa ?? '').trim()
  if (!tenCoSo || !diaChi || !tinhThanh || !quanHuyen || !text(f.soDienThoai) || !text(f.linkBanDo)) {
    return { error: 'Vui lòng nhập đầy đủ các mục có dấu *.' }
  }
  if (tenCoSo.length < 2 || tenCoSo.length > 150) return { error: 'Tên cơ sở từ 2 đến 150 ký tự.' }
  if (diaChi.length < 5 || diaChi.length > 255) return { error: 'Địa chỉ từ 5 đến 255 ký tự.' }
  if (tinhThanh.length < 2 || tinhThanh.length > 80) return { error: 'Tỉnh/Thành từ 2 đến 80 ký tự.' }
  if (quanHuyen.length < 2 || quanHuyen.length > 80) return { error: 'Quận/Huyện từ 2 đến 80 ký tự.' }
  const soDienThoai = normalizeContactPhone(f.soDienThoai)
  if (!CONTACT_PHONE_RE.test(soDienThoai)) {
    return { error: 'Số điện thoại không hợp lệ (di động 10 số hoặc số bàn 11 số, bắt đầu bằng 0).' }
  }
  if (zalo.length > 30) return { error: 'Zalo tối đa 30 ký tự.' }
  const loiLink = checkMapLink(f.linkBanDo)
  if (loiLink) return { error: loiLink }
  if (moTa.length > 2000) return { error: 'Mô tả tối đa 2000 ký tự.' }
  if (!f.gioMoCua || !f.gioDongCua) return { error: 'Vui lòng chọn giờ mở cửa và giờ đóng cửa.' }
  if (f.gioMoCua >= f.gioDongCua) return { error: 'Giờ đóng cửa phải sau giờ mở cửa.' }
  const soPhut = Number(f.soPhutDatToiThieu)
  if (!Number.isInteger(soPhut) || soPhut < 30 || soPhut % 30 !== 0) return { error: 'Thời gian đặt tối thiểu phải là bội số của 30 phút.' }

  const linkBanDo = String(f.linkBanDo).trim()
  const body = { tenCoSo, diaChi, tinhThanh, quanHuyen, soDienThoai, linkBanDo, gioMoCua: f.gioMoCua, gioDongCua: f.gioDongCua, soPhutDatToiThieu: soPhut }
  if (zalo) body.zalo = zalo
  if (moTa) body.moTa = moTa
  return { body }
}


// Lỗi của từng ô BẮT BUỘC trong cửa sổ Thêm / Sửa cơ sở (ô tuỳ chọn: Zalo, Mô tả, Ảnh không kiểm tra). Dùng để nhắc ngay khi chủ sân rời khỏi ô.
function branchFieldErrors(f) {
  const text = (v) => String(v ?? '').trim()
  const e = {}
  const ten = text(f.tenCoSo)
  if (!ten) e.tenCoSo = 'Vui lòng nhập tên cơ sở.'
  else if (ten.length < 2) e.tenCoSo = 'Tên cơ sở từ 2 đến 150 ký tự.'
  const dc = text(f.diaChi)
  if (!dc) e.diaChi = 'Vui lòng nhập địa chỉ.'
  else if (dc.length < 5) e.diaChi = 'Địa chỉ từ 5 đến 255 ký tự.'
  if (!text(f.tinhThanh)) e.tinhThanh = 'Vui lòng chọn Tỉnh/Thành.'
  if (!text(f.quanHuyen)) e.quanHuyen = 'Vui lòng chọn Quận/Huyện.'
  if (!text(f.soDienThoai)) e.soDienThoai = 'Vui lòng nhập số điện thoại.'
  else if (!CONTACT_PHONE_RE.test(normalizeContactPhone(f.soDienThoai))) e.soDienThoai = 'Số điện thoại không hợp lệ (di động 10 số hoặc số bàn 11 số, bắt đầu bằng 0).'
  const loiLink = checkMapLink(f.linkBanDo)
  if (loiLink) e.linkBanDo = loiLink
  if (!f.gioMoCua) e.gioMoCua = 'Vui lòng chọn giờ mở cửa.'
  if (!f.gioDongCua) e.gioDongCua = 'Vui lòng chọn giờ đóng cửa.'
  else if (f.gioMoCua && f.gioMoCua >= f.gioDongCua) e.gioDongCua = 'Giờ đóng cửa phải sau giờ mở cửa.'
  return e
}


function BranchCard({ b, busy, onEdit, onToggleLock, onDelete }) {
  const st = BRANCH_STATUS[b.trangThai] ?? { label: b.trangThai, className: 'status-wait', hint: '' }
  const place = [b.quanHuyen, b.tinhThanh].filter(Boolean).join(', ')
  return (
    <article className="branch-slide">
      <div className="branch-slide-photo">
        {b.duongDanAnh ? <img src={fileUrl(b.duongDanAnh)} alt={b.tenCoSo} /> : <span>Cơ sở chưa có ảnh</span>}
      </div>
      <div className="branch-slide-body">
        <div className="branch-slide-head">
          <h3>{b.tenCoSo}</h3>
          <span className={`status-badge ${st.className}`}>{st.label}</span>
        </div>
        {/* Sửa cơ sở (gồm cả đổi ảnh, giờ hoạt động) – Khoá / Mở khoá cơ sở – Xoá cơ sở */}
        <div className="branch-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(b)} disabled={busy || b.trangThai === 'locked'}>
            Sửa cơ sở
          </button>
          {b.trangThai === 'closed' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggleLock(b)} disabled={busy}>
              Mở khoá cơ sở
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onToggleLock(b)}
              disabled={busy || b.trangThai === 'locked' || Number(b.soSanHoatDong ?? 0) > 0}
              title={b.trangThai === 'locked' ? 'Cơ sở do quản trị viên khoá' : Number(b.soSanHoatDong ?? 0) > 0 ? 'Cần khoá tất cả sân của cơ sở trước (sân không còn đơn đặt)' : undefined}
            >
              Khoá cơ sở
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger-text"
            onClick={() => onDelete(b)}
            disabled={busy || b.trangThai !== 'closed'}
            title={b.trangThai === 'closed' ? 'Xoá cơ sở khỏi hệ thống' : 'Cần khoá cơ sở trước khi xoá'}
          >
            Xoá cơ sở
          </button>
        </div>
        <dl className="branch-info">
          <div>
            <dt>Địa chỉ</dt>
            <dd>
              {b.diaChi}
              {place ? `, ${place}` : ''}
              {b.linkBanDo && (
                <>
                  {' '}
                  <a href={b.linkBanDo} target="_blank" rel="noreferrer">
                    Xem bản đồ
                  </a>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Liên hệ</dt>
            <dd>
              {b.soDienThoai ?? '—'}
              {b.zalo ? ` · Zalo: ${b.zalo}` : ''}
            </dd>
          </div>
          <div>
            <dt>Giờ hoạt động</dt>
            <dd>
              {cut5(b.gioMoCua)} – {cut5(b.gioDongCua)} · đặt tối thiểu {b.soPhutDatToiThieu} phút
            </dd>
          </div>
          <div>
            <dt>Số sân</dt>
            <dd>
              {b.soSanHoatDong ?? 0} đang hoạt động / {b.soSan ?? 0} sân
            </dd>
          </div>
          <div>
            <dt>Giá thấp nhất</dt>
            <dd>{b.giaThapNhat != null ? `${formatVnd(Number(b.giaThapNhat))}/giờ` : 'Chưa có bảng giá'}</dd>
          </div>
          {b.moTa && (
            <div>
              <dt>Mô tả</dt>
              <dd>{b.moTa}</dd>
            </div>
          )}
        </dl>
        {st.hint && <p className="branch-hint">{st.hint}</p>}
      </div>
    </article>
  )
}


// Kích thước ảnh cơ sở tối đa (px)
const MAX_ANH_RONG = 657
const MAX_ANH_CAO = 465

export default function TrangQuanLyCoSo({ user, onCreated }) {
  const token = user.maTruyCap
  const isOwner = user.vaiTro === 'owner'
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(isOwner)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null) // cơ sở đang thao tác
  const [editing, setEditing] = useState(null) // cơ sở đang sửa (null = đang thêm mới)
  const [confirm, setConfirm] = useState(null) // { type: 'lock' | 'unlock' | 'delete', b, lyDo, busy, error }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_BRANCH_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [imageError, setImageError] = useState('')
  const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ''), [imageFile])
  useEffect(() => () => imagePreview && URL.revokeObjectURL(imagePreview), [imagePreview])
  // Chỉ nhận 1 ảnh JPG/PNG/WEBP, tối đa 5MB (giới hạn của API tải ảnh cơ sở)
  const chonAnhCoSo = (e) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setImageFile(null)
    setImageError('')
      return
    }
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setImageFile(null)
    setImageError('')
      setImageError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.')
      e.target.value = ''
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setImageFile(null)
    setImageError('')
      setImageError('Ảnh tối đa 5MB.')
      e.target.value = ''
      return
    }
    // Giới hạn kích thước ảnh: tối đa 657 x 465 px (rộng x cao)
    const input = e.target
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.naturalWidth > MAX_ANH_RONG || img.naturalHeight > MAX_ANH_CAO) {
        setImageFile(null)
        setImageError(`Ảnh quá lớn (${img.naturalWidth} x ${img.naturalHeight} px). Tối đa ${MAX_ANH_RONG} x ${MAX_ANH_CAO} px.`)
        input.value = ''
        return
      }
      setImageError('')
      setImageFile(f)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setImageFile(null)
      setImageError('Không đọc được ảnh, vui lòng chọn ảnh khác.')
      input.value = ''
    }
    img.src = url
  }
  const [dialogError, setDialogError] = useState('')
  const [touched, setTouched] = useState({}) // ô đã nhập xong (rời khỏi ô) → bắt đầu hiện lỗi của ô đó
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const listRef = useRef(null)
  const tick = useAutoRefresh()

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    callApi('/api/chu-san/co-so', { token })
      .then((data) => {
        if (!cancelled) setBranches(Array.isArray(data) ? data : data ? [data] : [])
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOwner, token, tick])

  if (!isOwner) {
    return (
      <Page>
        <Alert>Tài khoản quản trị viên không quản lý cơ sở nào.</Alert>
      </Page>
    )
  }

  // Khoá / mở khoá / xoá cơ sở: PATCH .../co-so/:maCoSo/dong, PATCH .../co-so/:maCoSo/mo, DELETE .../co-so/:maCoSo
  const runConfirm = async () => {
    const { type, b, lyDo } = confirm
    setConfirm((c) => ({ ...c, busy: true, error: '' }))
    try {
      if (type === 'delete') {
        await callApi(`/api/chu-san/co-so/${b.maCoSo}`, { method: 'DELETE', token, body: lyDo.trim() ? { lyDo: lyDo.trim() } : {} })
        setBranches((prev) => prev.filter((x) => x.maCoSo !== b.maCoSo))
        setSuccess(`Đã xoá cơ sở ${b.tenCoSo}.`)
      } else {
        const kq = await callApi(`/api/chu-san/co-so/${b.maCoSo}/${type === 'lock' ? 'dong' : 'mo'}`, {
          method: 'PATCH',
          token,
          body: type === 'lock' && lyDo.trim() ? { lyDo: lyDo.trim() } : {},
        })
        setBranches((prev) => prev.map((x) => (x.maCoSo === b.maCoSo ? { ...x, trangThai: kq.trangThai } : x)))
        setSuccess(type === 'lock' ? `Đã khoá cơ sở ${b.tenCoSo}.` : `Đã mở khoá cơ sở ${b.tenCoSo}.`)
      }
      setConfirm(null)
      onCreated?.()
    } catch (err) {
      const hint = err.status === 409 && type !== 'unlock' ? ' Hãy huỷ các đơn còn lại và khoá tất cả sân của cơ sở trước.' : ''
      setConfirm((c) => ({ ...c, busy: false, error: `${describeApiError(err)}${hint}` }))
    }
  }

  const openEdit = (b) => {
    setEditing(b)
    setForm({
      tenCoSo: b.tenCoSo ?? '',
      diaChi: b.diaChi ?? '',
      tinhThanh: b.tinhThanh ?? '',
      quanHuyen: b.quanHuyen ?? '',
      soDienThoai: b.soDienThoai ?? '',
      zalo: b.zalo ?? '',
      linkBanDo: b.linkBanDo ?? '',
      moTa: b.moTa ?? '',
      gioMoCua: cut5(b.gioMoCua) || '06:00',
      gioDongCua: cut5(b.gioDongCua) || '22:00',
      soPhutDatToiThieu: String(b.soPhutDatToiThieu ?? 60),
    })
    setImageFile(null)
    setImageError('')
    setDialogError('')
    setTouched({})
    setSubmitted(false)
    setDialogOpen(true)
  }
  const openDialog = () => {
    setEditing(null)
    setForm(EMPTY_BRANCH_FORM)
    setImageFile(null)
    setImageError('')
    setDialogError('')
    setTouched({})
    setSubmitted(false)
    setDialogOpen(true)
  }
  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setDialogError('')
  }
  // Nhắc lỗi từng ô bắt buộc: hiện sau khi rời khỏi ô, hoặc sau khi bấm Lưu
  const fieldErrors = branchFieldErrors(form)
  const blurField = (key) => () => setTouched((t) => ({ ...t, [key]: true }))
  const errOf = (key) => (touched[key] || submitted ? fieldErrors[key] : '')
  const invalidProps = (key) => (errOf(key) ? { 'aria-invalid': 'true', style: { borderColor: '#b3262b' } } : {})
  const errMsg = (key) => (errOf(key) ? <span className="field-error">{errOf(key)}</span> : null)

  const submit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(fieldErrors).length > 0) {
      // lỗi đã hiện dưới từng ô; đưa con trỏ về ô lỗi đầu tiên
      const first = ['tenCoSo', 'diaChi', 'tinhThanh', 'quanHuyen', 'soDienThoai', 'linkBanDo', 'gioMoCua', 'gioDongCua'].find((k) => fieldErrors[k])
      document.getElementById(`branch-${first}`)?.focus()
      return
    }
    const { body, error: invalid } = validateBranchForm(form)
    if (invalid) {
      setDialogError(invalid)
      return
    }
    if (!editing && !imageFile) {
      setImageError('Vui lòng chọn 1 ảnh cơ sở (bắt buộc).')
      document.getElementById('branch-anh')?.focus()
      return
    }
    setSaving(true)
    setDialogError('')
    try {
      if (editing) {
        // Sửa cơ sở: PUT /api/chu-san/co-so/:maCoSo. Đổi giờ hoạt động thì xử lý bảng giá trước (prepareHoursChange)
        const prep = await prepareHoursChange(token, editing, body.gioMoCua, body.gioDongCua)
        let updated
        try {
          updated = await callApi(`/api/chu-san/co-so/${editing.maCoSo}`, { method: 'PUT', token, body })
        } catch (err) {
          if (prep.restore) await prep.restore()
          throw err
        }
        let imageWarning = ''
        if (imageFile) {
          try {
            const saved = await uploadBranchImage(token, imageFile, editing.maCoSo)
            updated = { ...updated, duongDanAnh: saved.duongDanAnh }
          } catch (err) {
            imageWarning = ` Nhưng chưa lưu được ảnh (${describeApiError(err)}).`
          }
        }
        setBranches((prev) => prev.map((x) => (x.maCoSo === editing.maCoSo ? { ...x, ...updated } : x)))
        setDialogOpen(false)
        setError('')
        setSuccess(`Đã lưu cơ sở ${updated.tenCoSo ?? editing.tenCoSo}.${imageWarning}${prep.reminder ? ` ${prep.reminder}` : ''}`)
        onCreated?.()
        return
      }
      let created = await callApi('/api/chu-san/co-so', { method: 'POST', token, body })
      let imageWarning = ''
      if (imageFile) {
        try {
          const saved = await uploadBranchImage(token, imageFile, created.maCoSo)
          created = { ...created, duongDanAnh: saved.duongDanAnh }
        } catch (err) {
          imageWarning = ` Nhưng chưa lưu được ảnh (${describeApiError(err)}).`
        }
      }
      const next = [...branches, created]
      setBranches(next)
      onCreated?.() // có cơ sở rồi thì mở khoá các trang khác ngay
      setDialogOpen(false)
      setError('')
      setSuccess(`Đã thêm cơ sở ${created.tenCoSo}.${imageWarning}`)
      // đợi danh sách vẽ xong cơ sở mới rồi cuộn xuống cuối
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50)
    } catch (err) {
      setDialogError(describeApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <section className="card branch-card">
        <div className="branch-toolbar">
          <h2 className="card-title">Cơ sở của bạn{branches.length > 0 ? ` (${branches.length})` : ''}</h2>
          <button type="button" className="btn btn-primary" onClick={openDialog}>
            <PlusIcon /> Thêm cơ sở
          </button>
        </div>

        {loading && <p className="table-empty">Đang tải danh sách cơ sở...</p>}
        {!loading && branches.length === 0 && (
          <div className="branch-empty">
            <p>Bạn chưa có cơ sở nào.</p>
            <p className="field-hint">Bấm &quot;Thêm cơ sở&quot; để nhập thông tin cơ sở đầu tiên. Sau đó thêm sân và bảng giá để khách đặt được.</p>
          </div>
        )}
        {branches.length > 0 && (
          <div className="branch-list" ref={listRef}>
            {branches.map((b) => (
              <BranchCard key={b.maCoSo} b={b} busy={busyId === b.maCoSo} onEdit={openEdit} onToggleLock={(x) => setConfirm({ type: x.trangThai === 'closed' ? 'unlock' : 'lock', b: x, lyDo: '', busy: false, error: '' })} onDelete={(x) => setConfirm({ type: 'delete', b: x, lyDo: '', busy: false, error: '' })} />
            ))}
          </div>
        )}
      </section>

      {dialogOpen && (
        <Dialog title={editing ? 'Sửa cơ sở' : 'Thêm cơ sở'} width={640} onClose={() => !saving && setDialogOpen(false)}>
          <form onSubmit={submit} noValidate>
            <div className="branch-form">
              <label className="dialog-field branch-wide">
                <span>Tên cơ sở</span>
                <input id="branch-tenCoSo" className="input" value={form.tenCoSo} onChange={update('tenCoSo')} onBlur={blurField('tenCoSo')} maxLength={150} autoFocus {...invalidProps('tenCoSo')} />
                {errMsg('tenCoSo')}
              </label>
              <label className="dialog-field branch-wide">
                <span>Địa chỉ </span>
                <input id="branch-diaChi" className="input" value={form.diaChi} onChange={update('diaChi')} onBlur={blurField('diaChi')} maxLength={255} placeholder="Số nhà, đường, phường" {...invalidProps('diaChi')} />
                {errMsg('diaChi')}
              </label>
              <label className="dialog-field">
                <span>Tỉnh/Thành </span>
                <select id="branch-tinhThanh" className="input" value={form.tinhThanh} onBlur={blurField('tinhThanh')} {...invalidProps('tinhThanh')} onChange={(e) => setForm((f) => ({ ...f, tinhThanh: e.target.value, quanHuyen: '' }))}>
                  <option value="">Chọn Tỉnh/Thành</option>
                  {[BRANCH_PROVINCE].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {errMsg('tinhThanh')}
              </label>
              <label className="dialog-field">
                <span>Quận/Huyện </span>
                <select id="branch-quanHuyen" className="input" value={form.quanHuyen} onChange={update('quanHuyen')} onBlur={blurField('quanHuyen')} {...invalidProps('quanHuyen')} disabled={!form.tinhThanh}>
                  <option value="">{form.tinhThanh ? 'Chọn Quận/Huyện' : 'Chọn Tỉnh/Thành trước'}</option>
                  {(form.tinhThanh === BRANCH_PROVINCE ? BRANCH_DISTRICTS : []).map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                {errMsg('quanHuyen')}
              </label>
              <label className="dialog-field">
                <span>Số điện thoại </span>
                <input id="branch-soDienThoai" className="input" type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={11} value={form.soDienThoai} onChange={(e) => setForm((f) => ({ ...f, soDienThoai: onlyDigits(e.target.value) }))} onBlur={blurField('soDienThoai')} {...invalidProps('soDienThoai')} />
                {errMsg('soDienThoai')}
              </label>
              <label className="dialog-field">
                <span>Zalo (Tuỳ chọn)</span>
                <input className="input" inputMode="numeric" pattern="[0-9]*" value={form.zalo} onChange={(e) => setForm((f) => ({ ...f, zalo: onlyDigits(e.target.value) }))} maxLength={30} />
              </label>
              <label className="dialog-field branch-wide">
                <span>Link bản đồ (Google Maps) </span>
                <input id="branch-linkBanDo" className="input" type="text" value={form.linkBanDo} onChange={(e) => setForm((f) => ({ ...f, linkBanDo: e.target.value }))} onBlur={(e) => { setForm((f) => ({ ...f, linkBanDo: f.linkBanDo.trim() })); blurField('linkBanDo')(e) }} maxLength={500} placeholder="Dán link Google Maps, ví dụ https://maps.app.goo.gl/..." {...invalidProps('linkBanDo')} />
                {errMsg('linkBanDo')}
              </label>
              <label className="dialog-field">
                <span>Giờ mở cửa </span>
                <input id="branch-gioMoCua" className="input" type="time" value={form.gioMoCua} onChange={update('gioMoCua')} onBlur={blurField('gioMoCua')} {...invalidProps('gioMoCua')} />
                {errMsg('gioMoCua')}
              </label>
              <label className="dialog-field">
                <span>Giờ đóng cửa </span>
                <input id="branch-gioDongCua" className="input" type="time" value={form.gioDongCua} onChange={update('gioDongCua')} onBlur={blurField('gioDongCua')} {...invalidProps('gioDongCua')} />
                {errMsg('gioDongCua')}
              </label>
              <label className="dialog-field">
                <span>Thời gian đặt tối thiểu </span>
                <select className="input" value={form.soPhutDatToiThieu} onChange={update('soPhutDatToiThieu')}>
                  {MIN_BOOKING_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} phút
                    </option>
                  ))}
                </select>
              </label>
              <label className="dialog-field">
                <span>{editing ? 'Đổi ảnh cơ sở (tối đa 657 x 465 px)' : 'Ảnh cơ sở * (tối đa 657 x 465 px)'}</span>
                <input id="branch-anh" className="input input-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={chonAnhCoSo} {...(imageError ? { 'aria-invalid': 'true', style: { borderColor: '#b3262b' } } : {})} />
                {imageError && <span className="field-error">{imageError}</span>}
              </label>
              {imagePreview && (
                <div className="dialog-field branch-wide">
                  <div className="image-center-crop"><img src={imagePreview} alt="Ảnh cơ sở đã chọn" /></div>
                </div>
              )}
              <label className="dialog-field branch-wide">
                <span>Mô tả</span>
                <textarea className="input branch-textarea" rows={3} value={form.moTa} onChange={update('moTa')} maxLength={2000} />
              </label>
            </div>
            {!editing && <p className="picker-hint">Cơ sở mới ở trạng thái &quot;Chưa hiển thị cho khách&quot; cho tới khi có sân hoạt động và bảng giá.</p>}
            {dialogError && <p className="dialog-error">{dialogError}</p>}
            <div className="dialog-two">
              <button type="button" className="dialog-ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Huỷ
              </button>
              <button type="submit" className="dialog-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Lưu'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {confirm && (
        <Dialog
          title={confirm.type === 'lock' ? 'Khoá cơ sở' : confirm.type === 'unlock' ? 'Mở khoá cơ sở' : 'Xoá cơ sở'}
          width={460}
          onClose={() => !confirm.busy && setConfirm(null)}
        >
          <p className="picker-hint">
            {confirm.type === 'lock' &&
              `Khoá "${confirm.b.tenCoSo}": khách không đặt được cơ sở này; sân, bảng giá và lịch của cơ sở không dùng được cho tới khi mở khoá. Chỉ khoá được khi tất cả sân của cơ sở đã khoá. Mở khoá cơ sở thì các sân vẫn khoá cho tới khi bạn mở từng sân.`}
            {confirm.type === 'unlock' && `Mở khoá "${confirm.b.tenCoSo}" để cơ sở hoạt động trở lại (hiển thị cho khách khi có sân hoạt động và bảng giá).`}
            {confirm.type === 'delete' && `Xoá "${confirm.b.tenCoSo}" khỏi hệ thống? Thao tác này không hoàn tác được. Cơ sở còn đơn đặt hoặc đã từng có đơn đặt thì không xoá được.`}
          </p>
          {confirm.type !== 'unlock' && (
            <label className="dialog-field">
              <span>Lý do (tuỳ chọn)</span>
              <input className="input" value={confirm.lyDo} maxLength={255} onChange={(e) => setConfirm((c) => ({ ...c, lyDo: e.target.value }))} />
            </label>
          )}
          {confirm.error && <p className="dialog-error">{confirm.error}</p>}
          <div className="dialog-two">
            <button type="button" className="dialog-ghost" onClick={() => setConfirm(null)} disabled={confirm.busy}>
              Đóng
            </button>
            <button type="button" className={confirm.type === 'delete' ? 'dialog-danger' : 'dialog-primary'} onClick={runConfirm} disabled={confirm.busy}>
              {confirm.busy ? 'Đang xử lý...' : confirm.type === 'lock' ? 'Khoá cơ sở' : confirm.type === 'unlock' ? 'Mở khoá' : 'Xoá cơ sở'}
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  )
}
