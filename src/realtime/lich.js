// Xử lý phòng lịch sân: `lich:theo-doi` / `lich:bo-theo-doi` (mỗi socket tối đa 1 phòng lịch: mở lịch mới thì rời lịch cũ).
const { z } = require('zod');
const { tenPhongLich } = require('./phat');

const lichSchema = z.object({
  maCoSo: z.coerce.number().int().positive(),
  ngay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const loiAck = (ma, thongBao) => ({ ok: false, ma, thongBao });
const goiAck = (ack, ketQua) => { if (typeof ack === 'function') ack(ketQua); };

function dangKyXuLyLich(socket) {
  // Lịch sân là dữ liệu công khai (REST cũng công khai) → chỉ kiểm định dạng, không cần kiểm DB.
  socket.on('lich:theo-doi', async (duLieu, ack) => {
    const kq = lichSchema.safeParse(duLieu);
    if (!kq.success) return goiAck(ack, loiAck('BAD_REQUEST', 'Dữ liệu theo dõi lịch không hợp lệ'));
    const phong = tenPhongLich(kq.data.maCoSo, kq.data.ngay);
    // Mỗi socket tối đa GIOI_HAN_PHONG_LICH (=1) phòng lịch: mở lịch khác thì tự rời lịch cũ.
    const phongCu = [...socket.rooms].filter((p) => p.startsWith('lich:') && p !== phong);
    await Promise.all(phongCu.map((p) => socket.leave(p)));
    await socket.join(phong);
    return goiAck(ack, { ok: true, phong });
  });

  socket.on('lich:bo-theo-doi', (duLieu, ack) => {
    const kq = lichSchema.safeParse(duLieu);
    if (!kq.success) return goiAck(ack, loiAck('BAD_REQUEST', 'Dữ liệu theo dõi lịch không hợp lệ'));
    socket.leave(tenPhongLich(kq.data.maCoSo, kq.data.ngay));
    return goiAck(ack, { ok: true });
  });
}

module.exports = { dangKyXuLyLich };
