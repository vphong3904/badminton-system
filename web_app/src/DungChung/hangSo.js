import { addDaysISO, todayISO } from './thoiGian.js'

/* ============================================================
   Dữ liệu mẫu
   ============================================================ */

export const MENU = [
  { id: 'branches', label: 'Quản lý cơ sở' },
  { id: 'courts', label: 'Quản lý sân' },
  { id: 'pricing', label: 'Quản lý bảng giá' },
  { id: 'bookings', label: 'Quản lý đặt sân' },
  { id: 'calendar', label: 'Lịch hoạt động' },
  { id: 'refunds', label: 'Hoàn tiền' },
  { id: 'complaints', label: 'Khiếu nại' },
  { id: 'reviews', label: 'Đánh giá của Khách hàng' },
  { id: 'users', label: 'Danh sách khách đặt sân' },
  { id: 'overview', label: 'Doanh thu của cơ sở' },
]


// Địa bàn khi thêm cơ sở: app khách chỉ phục vụ TP. Hồ Chí Minh nên ô Tỉnh/Thành chỉ có một lựa chọn.
// Quận/Huyện là các đơn vị cấp huyện của TP.HCM trước 01/07/2026 (16 quận, 1 thành phố Thủ Đức, 5 huyện).
// Viết đúng như dữ liệu trong database (vd "Thủ Đức", "Gò Vấp") vì app khách lọc cơ sở theo đúng chuỗi này.
export const BRANCH_PROVINCE = 'TP. Hồ Chí Minh'

export const BRANCH_DISTRICTS = [
  'Quận 1', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 6', 'Quận 7', 'Quận 8', 'Quận 10', 'Quận 11', 'Quận 12',
  'Bình Tân', 'Bình Thạnh', 'Gò Vấp', 'Phú Nhuận', 'Tân Bình', 'Tân Phú', 'Thủ Đức',
  'Bình Chánh', 'Cần Giờ', 'Củ Chi', 'Hóc Môn', 'Nhà Bè',
]


export const ALL_BRANCHES = 'Tất cả cơ sở'

export const DEFAULT_DATE = '2026-10-30'

const HOURS = ['17:00', '18:00', '19:00', '20:00']

export const MAX_RANGE_DAYS = 90

export const BOOKING_STATUSES = ['Chờ thanh toán', 'Đã chuyển khoản', 'Đã thanh toán', 'Đã sử dụng sân', 'Chờ hoàn tiền', 'Đã huỷ']


// Ngân hàng trong nước (nhà nước, và Techcombank/MB Bank theo yêu cầu). `code` là mã ngân hàng
// đúng với danh sách của API (GET /api/tai-khoan/ngan-hang); API chỉ nhận mã, tên do BE tự lấy.
export const BANKS = [
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'CTG', name: 'VietinBank' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'VBA', name: 'Agribank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'MB', name: 'MB Bank' },
]


export const INITIAL_COURTS = [
  { id: 1, name: 'Green Smash Arena', branch: 'Quận 3', price: 90000, active: true },
  { id: 2, name: 'Sky Court Bình Thạnh', branch: 'Bình Thạnh', price: 110000, active: true },
  { id: 3, name: 'Ace Badminton Club', branch: 'Quận 10', price: 80000, active: true },
  { id: 4, name: 'Rally Hub Phú Nhuận', branch: 'Phú Nhuận', price: 120000, active: true },
  { id: 5, name: 'Vợt Xanh Thảo Điền', branch: 'Thủ Đức', price: 100000, active: true },
  { id: 6, name: 'Smash Point Tân Bình', branch: 'Tân Bình', price: 95000, active: true },
]


// Dữ liệu mẫu giả lập đơn khách đã đặt và chuyển tiền trên app (chưa có API chủ sân lấy đơn đặt): mặc định 'Đã đặt'
export const INITIAL_BOOKINGS = [
  { code: 'BD26082101', customer: 'Minh Anh', court: 'Sân 1', date: todayISO(), time: '18:00', gioBatDau: '18:00', gioKetThuc: '20:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26082072', customer: 'Trần Gia Huy', court: 'Sân 2', date: todayISO(), time: '19:00', gioBatDau: '19:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081709', customer: 'Lê Thu Hà', court: 'Sân 3', date: todayISO(), time: '17:00', gioBatDau: '17:00', gioKetThuc: '18:30', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26082110', customer: 'Nguyễn Văn An', court: 'Sân 1', date: todayISO(), time: '20:00', gioBatDau: '20:00', gioKetThuc: '21:30', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081001', customer: 'Hoàng Mai', court: 'Sân 1', date: addDaysISO(-1), time: '07:00', gioBatDau: '07:00', gioKetThuc: '09:00', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26081002', customer: 'Đỗ Minh', court: 'Sân 2', date: addDaysISO(-1), time: '18:00', gioBatDau: '18:00', gioKetThuc: '20:00', status: 'Hoàn tất', checkedIn: true },
  { code: 'BD26081003', customer: 'Vũ Lan', court: 'Sân 1', date: addDaysISO(1), time: '19:00', gioBatDau: '19:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
  { code: 'BD26081645', customer: 'Phạm Quốc Bảo', court: 'Sân 3', date: todayISO(), time: '20:00', gioBatDau: '20:00', gioKetThuc: '21:00', status: 'Đã đặt', checkedIn: false },
]


// Trạng thái cố định cho ngày mặc định (khớp thiết kế)
export const BASE_SCHEDULE = {
  'Green Smash Arena': ['trống', 'đã đặt', 'trống', 'trống'],
  'Sky Court Bình Thạnh': ['trống', 'trống', 'đã đặt', 'trống'],
  'Ace Badminton Club': ['đang giữ', 'trống', 'trống', 'trống'],
  'Rally Hub Phú Nhuận': ['trống', 'trống', 'trống', 'trống'],
  'Vợt Xanh Thảo Điền': ['trống', 'trống', 'trống', 'trống'],
  'Smash Point Tân Bình': ['trống', 'trống', 'trống', 'bảo trì'],
}


const STATUS_CLASS = {
  'trống': 'free',
  'đã đặt': 'booked',
  'đang giữ': 'hold',
  'bảo trì': 'maint',
}


export const WEEKLY = [
  { day: 'T2', value: 310 },
  { day: 'T3', value: 450 },
  { day: 'T4', value: 390 },
  { day: 'T5', value: 580 },
  { day: 'T6', value: 620 },
  { day: 'T7', value: 740 },
  { day: 'CN', value: 510 },
]


export const Y_TICKS = [800, 700, 600, 500, 400, 300, 200, 100, 0]


// Quản lý bảng giá theo từng cơ sở. API có sẵn:
//   GET /api/chu-san/co-so (danh sách cơ sở), GET /api/chu-san/co-so/:maCoSo/bang-gia (xem bảng giá),
//   POST /api/chu-san/co-so/:maCoSo/bang-gia (thêm một khung giờ), PUT /api/chu-san/co-so/:maCoSo/bang-gia (sửa / xóa khung giờ),
//   PUT /api/chu-san/co-so/:maCoSo (sửa giờ mở cửa)
export const ALL_BRANCHES_ID = 'all'


/* ============================================================
   App
   ============================================================ */

// Trang chủ sân (mở bằng nút "Xin chào, ...") — không nằm trong menu
export const PROFILE_PAGE = { id: 'profile', label: 'Trang chủ sân' }
