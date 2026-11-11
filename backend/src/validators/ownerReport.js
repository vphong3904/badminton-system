const { z } = require('zod');

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

exports.doanhThu = {
  query: z.object({ nam: z.coerce.number().int().min(2000).max(2100).optional() }),
};
exports.topKhach = { query: boLocNgay };
exports.topSan = { query: boLocNgay };

// ----- Đơn đặt sân (chủ sân xem) -----
const maSo = z.coerce.number().int().positive();
exports.danhSachDon = {
  query: z.object({
    trangThai: z.enum(['pending_payment', 'confirmed', 'completed', 'cancelled', 'expired']).optional(),
    maCoSo: maSo.optional(),
    maSan: maSo.optional(),
    ngay: ngay.optional(), // đúng 1 ngày chơi; ưu tiên hơn tuNgay/denNgay
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    soDong: z.coerce.number().int().min(1).max(200).optional(),
    tuKhoa: z.string().trim().min(1).max(50).optional(),
    trang: maSo.optional(),
  }).refine((duLieu) => !duLieu.tuNgay || !duLieu.denNgay || duLieu.tuNgay <= duLieu.denNgay, {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    path: ['denNgay'],
  }),
};
exports.maDon = { params: z.object({ maDatSan: maSo }) };
