const { z } = require('zod');
const quyTac = require('./quyTac');

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((giaTri) => {
  const ngayDate = new Date(`${giaTri}T00:00:00Z`);
  return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === giaTri;
});
const boLocNgay = z.object({
  tuNgay: ngay.optional(),
  denNgay: ngay.optional(),
}).refine((duLieu) => !duLieu.tuNgay || !duLieu.denNgay || duLieu.tuNgay <= duLieu.denNgay, {
  message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
  path: ['denNgay'],
});

// Doanh thu: lọc theo năm (nam), tháng (nam + thang), hoặc khoảng ngày tự chọn (tuNgay/denNgay).
// Nếu có tuNgay/denNgay thì ưu tiên hơn nam/thang. maCoSo: chỉ tính 1 cơ sở.
exports.doanhThu = {
  query: z.object({
    nam: z.coerce.number().int().min(2000).max(2100).optional(),
    thang: z.coerce.number().int().min(1).max(12).optional(),
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    maCoSo: z.coerce.number().int().positive().optional(),
  }).refine((duLieu) => !duLieu.tuNgay || !duLieu.denNgay || duLieu.tuNgay <= duLieu.denNgay, {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    path: ['denNgay'],
  }).refine((duLieu) => !duLieu.thang || duLieu.nam, {
    message: 'Lọc theo tháng cần truyền thêm nam',
    path: ['thang'],
  }),
};
exports.topKhach = { query: boLocNgay };
exports.topSan = { query: boLocNgay };

// ----- Đơn đặt sân (chủ sân xem) -----
const maSo = z.coerce.number().int().positive();
exports.danhSachDon = {
  query: z.object({
    trangThai: z.enum(['pending_payment', 'confirmed', 'completed', 'cancelled', 'expired']).optional(),
    trangThaiThanhToan: z.enum(['pending', 'confirming', 'success', 'failed', 'expired', 'late_payment']).optional(),
    maCoSo: maSo.optional(),
    maSan: maSo.optional(),
    ngay: ngay.optional(), // đúng 1 ngày chơi; ưu tiên hơn tuNgay/denNgay
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    soDong: z.coerce.number().int().min(1).max(200).optional(),
    tuKhoa: z.string().trim().min(1).max(50).optional(),
    trang: maSo.optional(),
    sapXep: z.enum(['moi-nhat', 'cu-nhat']).optional(), // mặc định moi-nhat: ngày chơi mới nhất trước, cũ nhất cuối
  }).refine((duLieu) => !duLieu.tuNgay || !duLieu.denNgay || duLieu.tuNgay <= duLieu.denNgay, {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    path: ['denNgay'],
  }),
};
exports.maDon = { params: z.object({ maDatSan: maSo }) };
exports.tuChoiThanhToan = {
  params: z.object({ maDatSan: maSo }),
  body: z.object({
    lyDo: z.string().trim().min(2, 'Vui lòng nhập lý do từ chối.').max(255, 'Lý do tối đa 255 ký tự.'),
  }),
};

// ----- Hoàn tiền (chủ sân) -----
exports.danhSachHoanTien = {
  query: z.object({ trangThai: z.enum(['processing', 'refunded']).optional() }),
};
exports.hoanThanhHoanTien = {
  params: z.object({ maThanhToan: maSo }),
  body: z.object({ maGiaoDichHoan: z.string().trim().min(1).max(100).optional() }),
};

// ----- Chủ sân tạo đơn (khách tại chỗ / cố định) -----
const gio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM')
  .refine((giaTri) => /:(00|30)$/.test(giaTri), 'Giờ phải theo mốc 30 phút (HH:00 hoặc HH:30).');
exports.taoDon = {
  body: z.object({
    maSan: z.number().int().positive(),
    ngay,
    ngayKetThuc: ngay.optional(), // có → khách cố định, mỗi ngày trong khoảng ngay..ngayKetThuc
    gioBatDau: gio,
    gioKetThuc: gio,
    tenKhach: quyTac.tenKhachDat,
    soDienThoai: quyTac.soDienThoaiLienHe,
    ghiChu: quyTac.ghiChu.optional(),
    daThu: z.boolean().optional(), // khách đã trả tiền chưa (mặc định: chưa thu)
  }).refine((duLieu) => duLieu.gioKetThuc > duLieu.gioBatDau, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['gioKetThuc'],
  }).refine((duLieu) => !duLieu.ngayKetThuc || duLieu.ngayKetThuc >= duLieu.ngay, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['ngayKetThuc'],
  }),
};

// ----- Thống kê khách hàng đặt sân (chủ sân) -----
const kiemTraKhoangNgay = [
  (duLieu) => !duLieu.tuNgay || !duLieu.denNgay || duLieu.tuNgay <= duLieu.denNgay,
  { message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc', path: ['denNgay'] },
];
const trangVaSoDong = {
  trang: maSo.optional(),
  soDong: z.coerce.number().int().min(1).max(100).optional(),
};
exports.thongKeKhach = {
  query: z.object({ tuNgay: ngay.optional(), denNgay: ngay.optional(), maCoSo: maSo.optional() })
    .refine(...kiemTraKhoangNgay),
};
exports.danhSachKhach = {
  query: z.object({
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    maCoSo: maSo.optional(),
    tuKhoa: z.string().trim().min(1).max(50).optional(),
    nhom: z.enum(['moi', 'quay-lai']).optional(), // moi: khách đặt lần đầu trong khoảng; quay-lai: từ 2 lượt trở lên
    sapXep: z.enum(['luot-dat', 'chi-tieu', 'gan-nhat', 'ten']).optional(),
    ...trangVaSoDong,
  }).refine(...kiemTraKhoangNgay),
};
exports.chiTietKhach = {
  query: z.object({
    maKhachHang: maSo.optional(),
    soDienThoai: z.string().trim().min(6).max(20).optional(),
    maCoSo: maSo.optional(),
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    ...trangVaSoDong,
  }).refine(...kiemTraKhoangNgay)
    .refine((duLieu) => Boolean(duLieu.maKhachHang) !== Boolean(duLieu.soDienThoai), {
      message: 'Truyền đúng một trong hai: maKhachHang hoặc soDienThoai',
      path: ['maKhachHang'],
    }),
};
