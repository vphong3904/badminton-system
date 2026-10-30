const { z } = require('zod');

const gioPhut = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
const maSo = z.coerce.number().int().positive();

const coSo = z.object({
  tenCoSo: z.string().trim().min(2).max(150),
  diaChi: z.string().trim().min(5).max(255),
  tinhThanh: z.string().trim().min(2).max(80),
  quanHuyen: z.string().trim().min(2).max(80),
  soDienThoai: z.string().trim().regex(/^(0|\+84)\d{9,10}$/),
  zalo: z.string().trim().max(30).optional(),
  linkBanDo: z.string().url().max(500),
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
exports.bangGia = { body: z.object({ khungGias: z.array(khungGia).min(1).max(24) }) };
exports.nganHang = {
  body: z.object({
    tenNganHang: z.string().trim().min(2).max(100),
    soTaiKhoan: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
exports.san = {
  body: z.object({
    tenSan: z.string().trim().min(1).max(50),
    trangThai: z.enum(['active', 'maintenance']).optional(),
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
