const { z } = require('zod');

const maSo = z.coerce.number().int().positive();
const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((giaTri) => {
    const ngayDate = new Date(`${giaTri}T00:00:00Z`);
    return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === giaTri;
  });

exports.maNguoiDung = { params: z.object({ maNguoiDung: maSo }) };
exports.duyetChuSan = {
  params: z.object({ maNguoiDung: maSo }),
  body: z.object({
    trangThai: z.enum(['approved', 'rejected']),
    lyDoTuChoi: z.string().trim().min(3).max(255).optional(),
  }).refine((duLieu) => duLieu.trangThai !== 'rejected' || !!duLieu.lyDoTuChoi, {
    message: 'Cần nêu lý do khi từ chối hồ sơ',
    path: ['lyDoTuChoi'],
  }),
};
exports.maThanhToan = { params: z.object({ maThanhToan: maSo }) };
exports.hoanTien = {
  params: z.object({ maThanhToan: maSo }),
  body: z.object({ maGiaoDichHoan: z.string().trim().min(3).max(100) }),
};
exports.maYeuCauRutTien = { params: z.object({ maYeuCau: maSo }) };
exports.daChiRutTien = {
  params: z.object({ maYeuCau: maSo }),
  body: z.object({ maGiaoDich: z.string().trim().min(3).max(100) }),
};
exports.tuChoiRutTien = {
  params: z.object({ maYeuCau: maSo }),
  body: z.object({ lyDoTuChoi: z.string().trim().min(3).max(255) }),
};
exports.danhSachNhatKy = {
  query: z.object({
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    gioiHan: z.coerce.number().int().min(1).max(100).default(50),
  }),
};
