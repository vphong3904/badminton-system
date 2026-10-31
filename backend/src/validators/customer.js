const { z } = require('zod');

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((giaTri) => {
    const ngayDate = new Date(`${giaTri}T00:00:00Z`);
    return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === giaTri;
  }, 'Ngày không hợp lệ');
const gio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
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
exports.maSan = { params: z.object({ maSan: maSo }) };
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
  tenKhach: z.string().trim().min(2).max(100).optional(),
  soDienThoai: z.string().trim().regex(/^(0|\+84)\d{9,10}$/).optional(),
  ghiChu: z.string().trim().max(500).optional(),
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
    tenNganHang: z.string().trim().min(2).max(100),
    maNganHang: z.string().trim().min(2).max(20),
    soTaiKhoan: z.string().trim().regex(/^\d{6,30}$/),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
