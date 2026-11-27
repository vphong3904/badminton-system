import { BANKS } from './hangSo.js'

// Thông báo lỗi chung chung khi đăng nhập sai (không tiết lộ email/tên đăng nhập có tồn tại hay không)
export const GENERIC_LOGIN_ERROR = 'Email hoặc mật khẩu không chính xác.'


// Chủ sân chỉ được vào trang quản trị khi hồ sơ đã được quản trị viên duyệt
export function getAccessBlockMessage(nguoiDung) {
  // Trang này chỉ dành cho chủ sân: backend cho cả quản trị viên đăng nhập web nên web phải chặn lại
  if (nguoiDung.vaiTro !== 'owner') return 'Tài khoản này không có quyền truy cập trang chủ sân.'
  if (nguoiDung.trangThaiDuyet === 'approved') return ''
  if (nguoiDung.trangThaiDuyet === 'rejected') {
    return 'Hồ sơ đăng ký của bạn đã bị từ chối. Vui lòng liên hệ quản trị viên.'
  }
  return 'Tài khoản đang ở trạng thái "Chờ duyệt". Bạn chỉ có thể đăng nhập sau khi quản trị viên xác nhận.'
}


/* ============================================================
   Đăng nhập / Đăng ký
   ============================================================ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Khớp backend: SĐT di động 10 số, đầu số 03/05/07/08/09 (chấp nhận +84 / khoảng trắng, được chuẩn hoá về 0xxxxxxxxx)
const NAME_RE = /^\p{L}[\p{L}\s'.-]*$/u

function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/[^0-9]/g, '')
  if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2)
  if (digits && !digits.startsWith('0')) digits = `0${digits}`
  return digits
}

const isMobilePhone = (raw) => /^0[35789]\d{8}$/.test(normalizePhone(raw))

// Yêu cầu của web: số điện thoại phải bắt đầu bằng số 0 và gồm 10 chữ số (không dùng +84)
// Số điện thoại đăng ký (có tiền tố +84): bắt đầu bằng 0 thì nhập đủ 10 số; bắt đầu bằng số khác thì nhập đủ 9 số
// và hệ thống tự thêm số 0 đứng trước (vd 123456789 → 0123456789). Trả về số 10 chữ số bắt đầu bằng 0, hoặc null.
export function parseVnPhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length === 11) digits = digits.slice(2)
  if (!digits) return null
  if (digits.startsWith('0')) return digits.length === 10 ? digits : null
  return digits.length === 9 ? `0${digits}` : null
}


// Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt
// Ô chỉ cho nhập số: bỏ mọi ký tự khác chữ số (kể cả khi dán); decimal=true cho phép thêm dấu '-' và '.'
export const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '')

const onlyDecimal = (v) => String(v ?? '').replace(/[^0-9.\-]/g, '')


const PASSWORD_MIN = 8

const PASSWORD_MAX = 16

export const PASSWORD_RULE_TEXT = `Mật khẩu từ ${PASSWORD_MIN} đến ${PASSWORD_MAX} ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.`


export function isStrongPassword(p) {
  return (
    p.length >= PASSWORD_MIN &&
    p.length <= PASSWORD_MAX &&
    !/\s/.test(p) &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /\d/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  )
}


// Khóa tạm khi đăng nhập sai liên tiếp (lưu theo email ở trình duyệt để tải lại trang vẫn còn khóa).
// Đang demo nên khóa 15 giây; khi chạy thật đổi LOCK_SECONDS thành 15 * 60.
export const MAX_FAILED_LOGINS = 5

const LOCK_SECONDS = 15

const LOCK_STORAGE_KEY = 'loginLocks'


function readLocks() {
  try {
    return JSON.parse(localStorage.getItem(LOCK_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}


function writeLocks(locks) {
  try {
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(locks))
  } catch {
    // bỏ qua nếu trình duyệt không cho lưu
  }
}


// Số giây còn bị khóa của email này (0 = không khóa)
export function getLockRemaining(email) {
  const until = readLocks()[email]?.lockedUntil || 0
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}


// Ghi nhận một lần sai; trả về true nếu vừa bị khóa
export function recordFailedLogin(email) {
  const locks = readLocks()
  const entry = locks[email] || { count: 0, lockedUntil: 0 }
  entry.count += 1
  let locked = false
  if (entry.count >= MAX_FAILED_LOGINS) {
    entry.count = 0
    entry.lockedUntil = Date.now() + LOCK_SECONDS * 1000
    locked = true
  }
  locks[email] = entry
  writeLocks(locks)
  return locked
}


export function clearFailedLogins(email) {
  const locks = readLocks()
  delete locks[email]
  writeLocks(locks)
}


// Email đăng nhập phải đúng dạng _@_._ hoặc _@_._._ (vd: ten@gmail.com, ten@mail.com.vn)
const LOGIN_EMAIL_RE = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+){1,2}$/

export function getEmailError(value) {
  const v = value.trim()
  if (!v) return 'Vui lòng nhập email.'
  if (!LOGIN_EMAIL_RE.test(v)) return 'Email chưa đúng dạng (ví dụ: ten@gmail.com hoặc ten@mail.com.vn).'
  return ''
}


// Kiểm tra từng ô của form đăng ký (cùng luật với backend). Trả về { tênTrường: thông báo lỗi } chỉ gồm ô đang lỗi.
export function validateRegister(form) {
  const errors = {}
  const name = form.name.trim().replace(/\s+/g, ' ')
  if (!name) errors.name = 'Vui lòng nhập họ và tên.'
  else if (name.length < 2) errors.name = 'Họ và tên phải có ít nhất 2 ký tự.'
  else if (name.length > 100) errors.name = 'Họ và tên tối đa 100 ký tự.'
  else if (!NAME_RE.test(name)) errors.name = 'Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.'

  const email = form.email.trim()
  if (email.length > 120) errors.email = 'Email tối đa 120 ký tự.'
  else if (getEmailError(email)) errors.email = getEmailError(email)

  const phone = parseVnPhone(form.phone)
  if (!form.phone.trim()) errors.phone = 'Vui lòng nhập số điện thoại.'
  else if (!phone || !isMobilePhone(phone)) errors.phone = 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.'

  const company = form.company.trim().replace(/\s+/g, ' ')
  if (!company) errors.company = 'Vui lòng nhập tên doanh nghiệp.'
  else if (company.length < 2) errors.company = 'Tên doanh nghiệp tối thiểu 2 ký tự.'
  else if (company.length > 150) errors.company = 'Tên doanh nghiệp tối đa 150 ký tự.'

  if (!BANKS.some((b) => b.code === form.bankCode)) errors.bankCode = 'Vui lòng chọn ngân hàng.'

  const accountNumber = form.accountNumber.replace(/\s/g, '')
  if (!accountNumber) errors.accountNumber = 'Vui lòng nhập số tài khoản.'
  else if (!/^\d{6,20}$/.test(accountNumber)) errors.accountNumber = 'Số tài khoản gồm 6–20 chữ số.'

  if (!form.password) errors.password = 'Vui lòng nhập mật khẩu.'
  else if (!isStrongPassword(form.password)) errors.password = PASSWORD_RULE_TEXT

  if (!form.confirm) errors.confirm = 'Vui lòng nhập lại mật khẩu.'
  else if (form.password !== form.confirm) errors.confirm = 'Mật khẩu nhập lại không khớp.'
  return errors
}
