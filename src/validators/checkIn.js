const { z } = require('zod');

const maSo = z.coerce.number().int().positive();

// Khách quét QR. token/phienBan sai định dạng KHÔNG bị zod chặn: để service trả QR_INVALID/QR_OUTDATED cho app
// hiển thị đúng thông báo. quetLuc (giờ thiết bị) chỉ nhận cho đủ hợp đồng, backend bỏ qua khi quyết định.
exports.checkIn = {
  params: z.object({ maDatSan: maSo }),
  body: z.object({
    maSan: maSo,
    token: z.string().min(1, 'Mã QR không hợp lệ.').max(200, 'Mã QR không hợp lệ.'),
    phienBan: maSo,
    quetLuc: z.string().max(40).optional(),
    viDo: z.number().min(-90).max(90).optional(),
    kinhDo: z.number().min(-180).max(180).optional(),
  }),
};

exports.maSan = { params: z.object({ maSan: maSo }) };

exports.trangIn = {
  params: z.object({ maSan: maSo }),
  query: z.object({ khoGiay: z.enum(['A4', 'A5']).optional() }),
};

exports.checkInThuCong = {
  params: z.object({ maDatSan: maSo }),
  body: z.object({
    lyDo: z.string().trim().min(2, 'Vui lòng nhập lý do check-in thủ công.').max(255, 'Lý do tối đa 255 ký tự.'),
  }),
};
