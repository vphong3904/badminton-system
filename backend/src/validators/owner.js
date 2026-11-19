const { z } = require('zod');

const gioPhut = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
const maSo = z.coerce.number().int().positive();

const quyTac = require('./quyTac');
const { laLinkGoogleMaps } = require('../utils/toaDoBanDo');

const coSo = z.object({
  tenCoSo: z.string().trim().min(2).max(150),
  diaChi: z.string().trim().min(5).max(255),
  tinhThanh: z.string().trim().min(2).max(80),
  quanHuyen: z.string().trim().min(2).max(80),
  soDienThoai: quyTac.soDienThoaiLienHe,
  // Link Google Maps (kể cả link rút gọn maps.app.goo.gl). Backend tự đọc toạ độ từ link này
  // để app khách tính khoảng cách "sân gần tôi" — chủ sân không nhập vĩ độ/kinh độ.
  linkBanDo: z.string().trim().url().max(500)
    .refine(laLinkGoogleMaps, 'Vui lòng dán link Google Maps (vd https://maps.app.goo.gl/...)'),
  moTa: z.string().max(2000).optional(),
  gioMoCua: gioPhut,
  gioDongCua: gioPhut,
  soPhutDatToiThieu: z.number().int().refine((giaTri) => giaTri % 30 === 0 && giaTri >= 30, 'Phải là bội số của 30 phút'),
}).refine((duLieu) => duLieu.gioMoCua < duLieu.gioDongCua, {
  message: 'Giờ đóng cửa phải sau giờ mở cửa',
  path: ['gioDongCua'],
});

const khungGia = z.object({
  gioBatDau: gioPhut,
  gioKetThuc: gioPhut,
  giaNgayThuongKhachVangLai: z.number().int().min(0).max(10_000_000),
  giaNgayThuongKhachCoDinh: z.number().int().min(0).max(10_000_000),
  giaCuoiTuanKhachVangLai: z.number().int().min(0).max(10_000_000),
  giaCuoiTuanKhachCoDinh: z.number().int().min(0).max(10_000_000),
});

exports.coSo = { body: coSo };
const maCoSoTrongDuongDan = z.object({ maCoSo: maSo });
exports.maCoSo = { params: maCoSoTrongDuongDan };
exports.capNhatCoSoTheoMa = { params: maCoSoTrongDuongDan, body: coSo };
// Thêm MỘT khung giá tuỳ chỉnh vào cơ sở (trang quản lý bảng giá → nút "Thêm bảng giá").
exports.themKhungGia = { params: maCoSoTrongDuongDan, body: khungGia };
exports.bangGiaTheoMa = {
  params: maCoSoTrongDuongDan,
  body: z.object({ khungGias: z.array(khungGia).min(1).max(24) }),
};
exports.danhSachSan = { query: z.object({ maCoSo: maSo.optional() }) };
exports.bangGia = { body: z.object({ khungGias: z.array(khungGia).min(1).max(24) }) };
exports.nganHang = {
  body: z.object({
    tenNganHang: z.string().trim().min(2).max(100),
    maNganHang: z.string().trim().min(2).max(20),
    soTaiKhoan: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
// Đổi tài khoản nhận tiền (mọi trạng thái hồ sơ): chỉ cần mã ngân hàng, BE tự lấy tên.
exports.doiNganHang = {
  body: z.object({
    maNganHang: z.string().trim().min(2).max(20)
      .refine((ma) => !!require('../utils/nganHang').timNganHang(ma), 'Ngân hàng không hợp lệ.'),
    soTaiKhoan: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản phải gồm 6–20 chữ số.'),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
const lyDoTuyChon = z.object({ lyDo: z.string().trim().min(2).max(255).optional() }).default({});
exports.dongXoaSan = { params: z.object({ maSan: maSo }), body: lyDoTuyChon };
exports.dongXoaCoSo = { params: maCoSoTrongDuongDan, body: lyDoTuyChon };
exports.doanhNghiep = {
  body: z.object({ tenDoanhNghiep: z.string().trim().min(2, 'Tên doanh nghiệp tối thiểu 2 ký tự.').max(150, 'Tên doanh nghiệp tối đa 150 ký tự.') }),
};
// Sân mới luôn tạo ở trạng thái chưa hoạt động; không nhận trangThai khi tạo (chủ sân bật bằng PATCH /san/:maSan/mo).
exports.san = {
  body: z.object({
    maCoSo: maSo.optional(),
    tenSan: z.string().trim().min(1).max(50),
  }),
};
exports.maSan = { params: z.object({ maSan: maSo }) };
exports.capNhatSan = {
  params: z.object({ maSan: maSo }),
  body: z.object({
    tenSan: z.string().trim().min(1).max(50).optional(),
    trangThai: z.enum(['active', 'maintenance']).optional(),
  }),
};
exports.khoaSan = {
  body: z.object({
    maSan: z.number().int().positive(),
    thoiGianBatDau: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Dạng YYYY-MM-DD HH:MM'),
    thoiGianKetThuc: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Dạng YYYY-MM-DD HH:MM'),
    lyDo: z.string().max(255).optional(),
  }).refine((duLieu) => duLieu.thoiGianBatDau < duLieu.thoiGianKetThuc, {
    message: 'Thời gian kết thúc phải sau bắt đầu',
    path: ['thoiGianKetThuc'],
  }),
};
exports.danhSachKhoaSan = {
  query: z.object({
    maSan: maSo.optional(),
    tuNgay: z.string().optional(),
    denNgay: z.string().optional(),
  }),
};
exports.maKhoaSan = { params: z.object({ maKhoa: maSo }) };

// Đánh giá của các cơ sở của chủ sân: xem + phản hồi.
exports.danhSachDanhGia = {
  query: z.object({
    maCoSo: maSo.optional(),
    soSao: z.coerce.number({ error: 'Số sao phải từ 1 đến 5.' })
      .int('Số sao phải từ 1 đến 5.').min(1, 'Số sao phải từ 1 đến 5.').max(5, 'Số sao phải từ 1 đến 5.').optional(),
    sapXep: z.enum(['moi-nhat', 'sao-thap', 'sao-cao'], { error: 'sapXep chỉ nhận moi-nhat, sao-thap hoặc sao-cao.' }).optional(),
    chuaPhanHoi: z.enum(['true', 'false'], { error: 'chuaPhanHoi chỉ nhận true hoặc false.' })
      .transform((giaTri) => giaTri === 'true').optional(),
    trang: z.coerce.number({ error: 'Trang phải là số nguyên từ 1.' })
      .int('Trang phải là số nguyên từ 1.').min(1, 'Trang phải là số nguyên từ 1.').default(1),
    soLuong: z.coerce.number({ error: 'Số lượng phải từ 1 đến 50.' })
      .int('Số lượng phải từ 1 đến 50.')
      .min(1, 'Số lượng phải từ 1 đến 50.').max(50, 'Số lượng phải từ 1 đến 50.').default(20),
  }),
};
exports.phanHoiDanhGia = {
  params: z.object({ maDanhGia: maSo }),
  body: z.object({
    noiDung: z.string({ error: 'Vui lòng nhập nội dung phản hồi.' }).trim()
      .min(2, 'Phản hồi tối thiểu 2 ký tự.').max(1000, 'Phản hồi tối đa 1000 ký tự.'),
  }),
};
exports.xoaPhanHoiDanhGia = { params: z.object({ maDanhGia: maSo }) };
