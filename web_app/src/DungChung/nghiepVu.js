import { ApiError, callApi } from './api.js'
import { SLOT_MIN, cut5, nowMs, toMinutes } from './thoiGian.js'

// Cơ sở bị khoá (chủ sân khoá = closed, quản trị viên khoá = locked): khách không đặt được, các chức năng liên quan bị vô hiệu
export const isBranchBlocked = (b) => b?.trangThai === 'closed' || b?.trangThai === 'locked'

// Link bản đồ: chủ sân tự dán link Google Maps (không còn gắn cứng phần https://maps.google.com/?q=).
// Luật khớp backend (validators/owner.js + utils/toaDoBanDo.js: laLinkGoogleMaps): http(s), tối đa 500 ký tự, host Google Maps / link rút gọn.
export function checkMapLink(value) {
  const v = String(value ?? '').trim()
  if (!v) return 'Vui lòng nhập link Google Maps.'
  if (v.length > 500) return 'Link bản đồ tối đa 500 ký tự.'
  let url
  try {
    url = new URL(v)
  } catch {
    return 'Link không hợp lệ. Hãy dán link Google Maps, ví dụ https://maps.app.goo.gl/...'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Link phải bắt đầu bằng http:// hoặc https://.'
  const host = url.hostname
  const laRutGon = /^(maps\.app\.goo\.gl|goo\.gl)$/i.test(host)
  const laMaps = /^maps\.google\.[a-z.]+$/i.test(host)
  const laGoogleMaps = /^(www\.)?google\.[a-z.]+$/i.test(host) && url.pathname.startsWith('/maps')
  if (!laRutGon && !laMaps && !laGoogleMaps) return 'Vui lòng dán link Google Maps (ví dụ https://maps.app.goo.gl/...).'
  return ''
}


// Trạng thái hiển thị = gộp trạng thái đơn (DatSan.TrangThai) và trạng thái thanh toán (ThanhToan.TrangThai) của backend:
//  - pending_payment + pending: khách vừa đặt từ app, chưa chuyển khoản → "Chưa hoàn tiền"
//  - pending_payment + confirming: khách đã gửi ảnh chuyển khoản → "Đã thanh toán" (chờ chủ sân Xác nhận / Huỷ đơn đặt)
//  - confirmed / completed → "Đã xác nhận" (lên Lịch hoạt động)
export function layTrangThaiDon(d) {
  // Đơn khách vừa đặt chưa chuyển khoản (pending) và đơn hết hạn không hiển thị ở Quản lý đặt sân (trả về null)
  if (d.trangThai === 'pending_payment') {
    if (d.trangThaiThanhToan !== 'confirming') return null
    // Khách đã gửi ảnh chuyển khoản nhưng qua giờ kết thúc mà chủ sân chưa duyệt → hiển thị "Đã huỷ" ngay
    // (đúng luật job backend chotDonQuaGioChoi: đơn → expired, thanh toán → late_payment, hoàn 100% do Admin xử lý)
    return nowMs() >= mocGioDon(d, d.gioKetThuc) ? 'Đã huỷ' : 'Đã chuyển khoản'
  }
  // Đơn đã được hệ thống chốt vì qua giờ chơi chưa duyệt (backend: expired + late_payment)
  if (d.trangThai === 'expired' && d.trangThaiThanhToan === 'late_payment') return 'Đã huỷ'
  // Chủ sân tạo đơn ở Lịch hoạt động → "Chờ thanh toán" cho đến khi bấm "Thu tiền" thì thành "Đã thanh toán"; đơn của khách (chuyển khoản) → "Đã chuyển khoản"
  if (d.trangThai === 'confirmed' || d.trangThai === 'completed' || d.trangThai === 'checked_in') {
    // Đơn đã thanh toán (khách chuyển khoản hoặc chủ sân đã thu tiền) mà đã qua giờ kết thúc → "Đã sử dụng sân"
    const daThanhToan = d.nguon !== 'owner' || d.trangThaiThu === 'paid'
    const quaGio = d.trangThai === 'completed' || nowMs() >= mocGioDon(d, d.gioKetThuc)
    if (daThanhToan && quaGio) return 'Đã sử dụng sân'
    if (d.nguon !== 'owner') return 'Đã chuyển khoản'
    return d.trangThaiThu === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'
  }
  if (d.trangThai === 'cancelled') {
    // Khách đã chuyển khoản mà đơn bị huỷ → "Chờ hoàn tiền" đến khi chủ sân hoàn xong (trang Hoàn tiền) thì thành "Đã huỷ"
    if (d.trangThaiThanhToan === 'success' && (d.trangThaiHoanTien === 'processing' || d.trangThaiHoanTien === 'waiting_info')) return 'Chờ hoàn tiền'
    return 'Đã huỷ'
  }
  return null
}


// Thời điểm bắt đầu / kết thúc của đơn (giờ Việt Nam, cùng cách backend so với giờ hiện tại)
function mocGioDon(d, gio) {
  return new Date(`${String(d.ngay).slice(0, 10)}T${String(gio).slice(0, 5)}:00+07:00`).getTime()
}

// Nút "Huỷ đơn" chỉ còn khi chưa quá thời gian của đơn: đơn khách (hoàn tiền theo API) chỉ huỷ được trước giờ bắt đầu,
// đơn chủ sân tự tạo huỷ được đến hết giờ kết thúc; sau đó nút biến mất.
export function coTheHuyDon(d, now = nowMs()) {
  if (d.trangThai === 'pending_payment') return d.trangThaiThanhToan === 'confirming' && now < mocGioDon(d, d.gioBatDau)
  if (d.trangThai !== 'confirmed') return false
  return d.nguon === 'owner' ? now < mocGioDon(d, d.gioKetThuc) : now < mocGioDon(d, d.gioBatDau)
}

// Nút "Chuyển sân": chỉ khi đơn còn hiệu lực (đã xác nhận, hoặc khách đã gửi ảnh chuyển khoản chờ duyệt) và CHƯA tới giờ bắt đầu.
export function coTheChuyenSan(d, now = nowMs()) {
  const conHieuLuc = d.trangThai === 'confirmed' || (d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'confirming')
  return conHieuLuc && now < mocGioDon(d, d.gioBatDau)
}

// Lý do huỷ đơn do chủ sân chọn: 'problem' = Sân đang có vấn đề (hoàn 100%), 'other' = Lý do khác (chủ sân tự nhập)
export const LY_DO_SAN_CO_VAN_DE = 'Sân đang có vấn đề'

// Huỷ đơn bằng API có sẵn theo loại đơn:
//  - đơn chủ sân tạo: PATCH /dat-san/:maDatSan/huy (không hoàn tiền trong hệ thống)
//  - đơn của khách: POST /dat-san/:maDatSan/huy (hoàn theo API, đơn vào hàng đợi Hoàn tiền); đơn khách vừa gửi ảnh chuyển khoản
//    phải được xác nhận trước thì API huỷ mới nhận.
export async function huyDonTheoLoai(token, d, lyDo) {
  if (d.nguon === 'owner') return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'PATCH', token, body: { lyDo } })
  if (d.trangThai === 'pending_payment' && d.trangThaiThanhToan === 'confirming') {
    // API huỷ đơn của khách chỉ nhận trước giờ bắt đầu: kiểm tra trước để không xác nhận thanh toán rồi mới báo lỗi
    if (nowMs() >= mocGioDon(d, d.gioBatDau)) throw new ApiError(0, 'Đơn đã quá giờ bắt đầu nên hệ thống không huỷ được nữa.')
    await callApi(`/api/chu-san/dat-san/${d.maDatSan}/xac-nhan-thanh-toan`, { method: 'POST', token })
  }
  return callApi(`/api/chu-san/dat-san/${d.maDatSan}/huy`, { method: 'POST', token, body: { lyDo } })
}


// Đổi giờ hoạt động của cơ sở → xử lý bảng giá (API có sẵn GET/PUT /api/chu-san/co-so/:maCoSo/bang-gia):
//  - Giờ mở cửa tăng / giờ đóng cửa giảm (thu hẹp): cắt các khung giá cho vừa giờ mới (khung nằm hẳn ngoài thì bỏ).
//  - Giờ mở cửa giảm / giờ đóng cửa tăng (mở rộng): giữ nguyên khung giá, nhắc chủ sân bổ sung bảng giá cho phần mới;
//    yêu cầu mọi sân của cơ sở đã khoá (Quản lý sân) trước.
// Trả về { restore, reminder }; restore() khôi phục bảng giá cũ nếu bước lưu cơ sở sau đó bị lỗi.
export async function prepareHoursChange(token, b, newOpen, newClose) {
  const oldOpen = cut5(b.gioMoCua)
  const oldClose = cut5(b.gioDongCua)
  if (newOpen === oldOpen && newClose === oldClose) return { restore: null, reminder: '' }
  const moRong = newOpen < oldOpen || newClose > oldClose
  const thuHep = newOpen > oldOpen || newClose < oldClose
  if (moRong && Number(b.soSanHoatDong ?? 0) > 0) {
    throw new ApiError(0, 'Muốn mở rộng giờ hoạt động, hãy khoá tất cả sân của cơ sở này ở trang Quản lý sân trước (sân phải không còn đơn đặt).')
  }
  let restore = null
  if (thuHep) {
    const bg = await callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { token })
    const goc = bg.khungGias ?? []
    const mapKhung = (k, start, end) => {
      const co7 = Array.isArray(k.giaTheoThu) && k.giaTheoThu.length === 7 && k.giaTheoThu.every((g) => g.giaKhachVangLai != null && g.giaKhachCoDinh != null)
      return co7
        ? { gioBatDau: start, gioKetThuc: end, giaTheoThu: k.giaTheoThu }
        : {
            gioBatDau: start,
            gioKetThuc: end,
            giaNgayThuongKhachVangLai: k.giaNgayThuongKhachVangLai,
            giaNgayThuongKhachCoDinh: k.giaNgayThuongKhachCoDinh,
            giaCuoiTuanKhachVangLai: k.giaCuoiTuanKhachVangLai,
            giaCuoiTuanKhachCoDinh: k.giaCuoiTuanKhachCoDinh,
          }
    }
    const moi = []
    let doi = false
    goc.forEach((k) => {
      const start = toMinutes(cut5(k.gioBatDau)) < toMinutes(newOpen) ? newOpen : cut5(k.gioBatDau)
      const end = toMinutes(cut5(k.gioKetThuc)) > toMinutes(newClose) ? newClose : cut5(k.gioKetThuc)
      if (toMinutes(end) <= toMinutes(start)) {
        doi = true
        return
      }
      if (start !== cut5(k.gioBatDau) || end !== cut5(k.gioKetThuc)) doi = true
      moi.push(mapKhung(k, start, end))
    })
    if (doi) {
      if (moi.length === 0) throw new ApiError(0, 'Không còn khung giá nào nằm trong giờ hoạt động mới. Hãy thêm khung giá phù hợp ở Quản lý bảng giá trước.')
      await callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { method: 'PUT', token, body: { khungGias: moi } })
      restore = () => callApi(`/api/chu-san/co-so/${b.maCoSo}/bang-gia`, { method: 'PUT', token, body: { khungGias: goc.map((k) => mapKhung(k, cut5(k.gioBatDau), cut5(k.gioKetThuc))) } }).catch(() => {})
    }
  }
  const reminder = moRong
    ? `Giờ hoạt động đã mở rộng: hãy bổ sung bảng giá cho phần giờ mới ở Quản lý bảng giá (bảng giá phải phủ hết ${newOpen}–${newClose}) rồi mới mở lại các sân.`
    : ''
  return { restore, reminder }
}


// Giá của một khung giờ theo từng thứ (1 = Thứ 2 … 7 = Chủ nhật): backend trả `giaTheoThu` (7 thứ riêng); thiếu thì dùng 4 trường cũ (T2–T6 / T7–CN).
export function giaCuaThu(k, thu, coDinh = false) {
  const g = Array.isArray(k.giaTheoThu) ? k.giaTheoThu.find((x) => x.thu === thu) : null
  if (g) return (coDinh ? g.giaKhachCoDinh : g.giaKhachVangLai) ?? null
  const cuoi = thu >= 6
  const v = coDinh ? (cuoi ? k.giaCuoiTuanKhachCoDinh : k.giaNgayThuongKhachCoDinh) : cuoi ? k.giaCuoiTuanKhachVangLai : k.giaNgayThuongKhachVangLai
  return v ?? null
}

const thuTuJs = (getDay) => (getDay === 0 ? 7 : getDay)
 // getDay(): 0 = Chủ nhật → 7

// Giá (đ/giờ, khách vãng lai) của cơ sở tại một thời điểm theo bảng giá (giá riêng từng thứ)
export function priceAt(khungGias, thoiDiem) {
  const phut = thoiDiem.getHours() * 60 + thoiDiem.getMinutes()
  const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && phut < toMinutes(cut5(x.gioKetThuc)))
  if (!k) return null
  const gia = giaCuaThu(k, thuTuJs(thoiDiem.getDay()))
  return gia == null ? null : Number(gia)
}


// Tổng giá của một lượt đặt theo bảng giá của cơ sở (cùng cách tính với backend: cộng từng ô 30 phút = giá/giờ ÷ 2,
// làm tròn theo từng ngày). Trả về null nếu có ô giờ chưa có giá.
export function tinhTongGia(khungGias, cacNgay, gioBatDau, gioKetThuc, coDinh) {
  let tong = 0
  for (const ngay of cacNgay) {
    const thu = thuTuJs(new Date(`${ngay}T00:00:00Z`).getUTCDay())
    let ngayTien = 0
    for (let phut = toMinutes(gioBatDau); phut < toMinutes(gioKetThuc); phut += SLOT_MIN) {
      const k = (khungGias ?? []).find((x) => toMinutes(cut5(x.gioBatDau)) <= phut && toMinutes(cut5(x.gioKetThuc)) >= phut + SLOT_MIN)
      if (!k) return null
      const gia = giaCuaThu(k, thu, coDinh)
      if (gia == null) return null
      ngayTien += Number(gia) / 2
    }
    tong += Math.round(ngayTien)
  }
  return tong
}
