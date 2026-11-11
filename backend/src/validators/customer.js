const { z } = require('zod');
const quyTac = require('./quyTac');

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((giaTri) => {
    const ngayDate = new Date(`${giaTri}T00:00:00Z`);
    return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === giaTri;
  }, 'Ngày không hợp lệ');
const gio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM')
  .refine((giaTri) => /:(00|30)$/.test(giaTri), 'Giờ phải theo mốc 30 phút (HH:00 hoặc HH:30).');
const maSo = z.coerce.number().int().positive();

const khungGio = {
  ngay,
  gioBatDau: gio,
  gioKetThuc: gio,
};

exports.timCoSo = {
  query: z.object({
    ...khungGio,
    tinhThanh: z.string().trim().min(2).max(80).optional(),
    quanHuyen: z.string().trim().min(2).max(80).optional(),
  }).refine((duLieu) => duLieu.gioKetThuc > duLieu.gioBatDau, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['gioKetThuc'],
  }),
};

exports.maCoSo = { params: z.object({ maCoSo: maSo }) };
exports.themYeuThich = { body: z.object({ maCoSo: maSo }) };
exports.maSan = { params: z.object({ maSan: maSo }) };
exports.lichNgay = {
  params: z.object({ maCoSo: maSo }),
  query: z.object({ ngay }),
};
exports.kiemTraTrong = {
  params: z.object({ maSan: maSo }),
  query: z.object(khungGio).refine((duLieu) => duLieu.gioKetThuc > duLieu.gioBatDau, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['gioKetThuc'],
  }),
};

const thongTinDat = z.object({
  maSan: z.number().int().positive(),
  ngay: ngay,
  gioBatDau: gio,
  gioKetThuc: gio,
  // FE luôn gửi đủ tên + SĐT liên hệ (booking_confirm_screen) nên BE bắt buộc, không tự lấy hồ sơ nữa.
  tenKhach: quyTac.tenKhachDat,
  soDienThoai: quyTac.soDienThoaiLienHe,
  ghiChu: quyTac.ghiChu.optional(),
}).refine((duLieu) => duLieu.gioKetThuc > duLieu.gioBatDau, {
  message: 'Giờ kết thúc phải sau giờ bắt đầu',
  path: ['gioKetThuc'],
});

exports.datLe = { body: thongTinDat };
exports.datCoDinh = {
  body: thongTinDat.extend({ ngayKetThuc: ngay }).refine((duLieu) => duLieu.ngayKetThuc >= duLieu.ngay, {
    message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi',
    path: ['ngayKetThuc'],
  }),
};
exports.maDatSan = { params: z.object({ maDatSan: maSo }) };
exports.thongTinHoanTien = {
  params: z.object({ maDatSan: maSo }),
  body: z.object({
    tenNganHang: z.string({ error: 'Vui lòng chọn ngân hàng.' }).trim()
      .min(2, 'Vui lòng chọn ngân hàng.').max(100, 'Tên ngân hàng tối đa 100 ký tự.'),
    maNganHang: z.string().trim().min(2).max(20),
    // Bỏ dấu cách/gạch trước khi kiểm (đúng chuẩn hoá FE ở 05-validation.md).
    soTaiKhoan: z.string({ error: 'Số tài khoản chỉ gồm 6–30 chữ số.' })
      .transform((giaTri) => giaTri.replace(/[\s-]/g, ''))
      .pipe(z.string().regex(/^\d{6,30}$/, 'Số tài khoản chỉ gồm 6–30 chữ số.')),
    chuTaiKhoan: z.string({ error: 'Vui lòng nhập tên chủ tài khoản.' }).trim()
      .min(2, 'Vui lòng nhập tên chủ tài khoản.').max(100, 'Tên chủ tài khoản tối đa 100 ký tự.'),
  }),
};
