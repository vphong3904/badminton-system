const dichVu = require('../services/communityChatService');
const { tenPhongChat } = require('./phat');

function traAck(ack, duLieu) {
  if (typeof ack === 'function') {
    try { ack(duLieu); } catch {}
  }
}

function dangKyXuLyChat(socket) {
  const maNguoiDung = socket.data.nguoiDung.maNguoiDung;

  socket.on('chat:vao', async (payload = {}, ack) => {
    try {
      const maPhong = dichVu.kiemTraMa(payload.maPhong);
      const { phong } = await dichVu.kiemTraQuyenDoc(maPhong, maNguoiDung);
      const tenPhong = tenPhongChat(maPhong);
      await socket.join(tenPhong);
      traAck(ack, { ok: true, maPhong, trangThaiPhong: phong.trangThaiPhong });
    } catch (loi) {
      traAck(ack, { ok: false, loi: { ma: loi.maLoi || 'INTERNAL', thongBao: loi.message || 'Không thể vào phòng chat' } });
    }
  });

  socket.on('chat:roi', async (payload = {}, ack) => {
    try {
      const maPhong = dichVu.kiemTraMa(payload.maPhong);
      await socket.leave(tenPhongChat(maPhong));
      traAck(ack, { ok: true, maPhong });
    } catch (loi) {
      traAck(ack, { ok: false, loi: { ma: loi.maLoi || 'BAD_REQUEST', thongBao: loi.message || 'Không thể rời phòng chat' } });
    }
  });

  socket.on('chat:gui', async (payload = {}, ack) => {
    try {
      const tin = await dichVu.guiTinNhan({
        maPhong: payload.maPhong,
        maNguoiGui: maNguoiDung,
        noiDung: payload.noiDung,
      });
      // guiTinNhan đã commit DB và phát chat:tin-moi tới room trước khi trả về.
      traAck(ack, { ok: true, tinNhan: tin });
    } catch (loi) {
      traAck(ack, {
        ok: false,
        loi: {
          ma: loi.maLoi || 'INTERNAL',
          thongBao: loi.message || 'Không gửi được tin nhắn',
          ...(loi.maTrangThai === 429 ? { maTrangThai: 429 } : {}),
        },
      });
    }
  });
}

module.exports = { dangKyXuLyChat };
