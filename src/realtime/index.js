// Khởi tạo Socket.IO (G8.0). Một instance Node, không Redis adapter.
// Xác thực: JWT hiện có qua `auth: { token }` lúc bắt tay, kiểm tra y hệt middlewares/auth.js.
// Phòng: user:{id} (tự vào) · chung (tự vào) · admin (nếu vai trò admin) · phong:{id} (G8.2, `chat:vao`) · lich:{maCoSo}:{ngay}.
const { Server } = require('socket.io');
const cauHinh = require('../config/env');
const { xacThucToken } = require('../middlewares/auth');
const { datIo, tenPhongNguoiDung, PHONG_ADMIN, PHONG_CHUNG } = require('./phat');
const { dangKyXuLyLich } = require('./lich');
const { dangKyXuLyChat } = require('./chat');

// setTimeout tối đa ~24,8 ngày; token dài hơn thì bỏ hẹn giờ (REST vẫn kiểm token mỗi lần).
const TOI_DA_HEN_GIO_MS = 2 ** 31 - 1;

function taoLoiBatTay(loi) {
  const e = new Error(loi.message || 'Không xác thực được');
  e.data = { ma: loi.maLoi || 'UNAUTHORIZED', thongBao: loi.message || 'Không xác thực được' };
  return e;
}

function khoiTaoRealtime(maychuHttp) {
  const io = new Server(maychuHttp, {
    cors: { origin: cauHinh.nguonTruyCap === '*' ? true : cauHinh.nguonTruyCap.split(',') },
  });

  io.use(async (socket, goiTiep) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) {
        return goiTiep(taoLoiBatTay({ message: 'Chưa đăng nhập', maLoi: 'UNAUTHORIZED' }));
      }
      const { nguoiDung, thongTinToken } = await xacThucToken(token);
      socket.data.nguoiDung = nguoiDung;
      socket.data.hanToken = thongTinToken.exp ? thongTinToken.exp * 1000 : null;
      return goiTiep();
    } catch (loi) {
      return goiTiep(taoLoiBatTay(loi));
    }
  });

  io.on('connection', (socket) => {
    const { maNguoiDung, vaiTro } = socket.data.nguoiDung;
    socket.join(tenPhongNguoiDung(maNguoiDung));
    socket.join(PHONG_CHUNG);
    if (vaiTro === 'admin') socket.join(PHONG_ADMIN);

    // Token hết hạn khi đang kết nối: báo UNAUTHORIZED rồi ngắt; client lấy token mới và nối lại.
    if (socket.data.hanToken) {
      const conLai = socket.data.hanToken - Date.now();
      if (conLai > 0 && conLai <= TOI_DA_HEN_GIO_MS) {
        const hen = setTimeout(() => {
          socket.emit('loi', { ma: 'UNAUTHORIZED', thongBao: 'Token đã hết hạn' });
          socket.disconnect(true);
        }, conLai);
        if (typeof hen.unref === 'function') hen.unref();
        socket.on('disconnect', () => clearTimeout(hen));
      }
    }

    dangKyXuLyLich(socket);
    dangKyXuLyChat(socket);

    socket.emit('ket-noi:san-sang', { maNguoiDung, vaiTro });
  });

  datIo(io);
  return io;
}

module.exports = { khoiTaoRealtime };
