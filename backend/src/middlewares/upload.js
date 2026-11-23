const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

// QUY TẮC LƯU ẢNH (xem docs/agent/01-rules.md):
//   uploads/avatar/  ảnh đại diện   tên: u<maNguoiDung>-<ms>-<4hex>.<jpg|png|webp>
//   uploads/coso/    ảnh cơ sở      tên: cs<maCoSo>-<ms>-<4hex>.<jpg|png|webp>
//   uploads/su-kien/ ảnh bìa sự kiện tên: sk<maSuKien>-<ms>-<4hex>.<jpg|png|webp>
//   uploads/         (gốc) ảnh chứng từ chuyển khoản — giữ cách cũ
// DB lưu đường dẫn tương đối `/tep-tai-len/<thuMuc>/<tên>`; chưa có ảnh → DB NULL, API trả ảnh mặc định.
// Ảnh mặc định (có sẵn, KHÔNG BAO GIỜ xoá/ghi đè): avatar/default-user.jpg, coso/coso.jpg.
const thuMucTepTaiLen = path.join(__dirname, '../../uploads');
const TIEN_TO_URL = '/tep-tai-len';
const ANH_MAC_DINH = {
  avatar: `${TIEN_TO_URL}/avatar/default-user.jpg`,
  coso: `${TIEN_TO_URL}/coso/coso.jpg`,
};
const DUOI_THEO_MIME = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const locAnh = (_req, tep, goiLai) =>
  DUOI_THEO_MIME[tep.mimetype] ? goiLai(null, true) : goiLai(AppError.duLieuKhongHopLe('Chỉ nhận ảnh jpg/png/webp'));
const GIOI_HAN = { fileSize: 5 * 1024 * 1024 };

// Ảnh chuyển khoản (thư mục gốc, tên ngẫu nhiên) — không đổi.
const taiTep = multer({
  storage: multer.diskStorage({
    destination: thuMucTepTaiLen,
    filename: (_req, tep, goiLai) =>
      goiLai(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(tep.originalname).toLowerCase()}`),
  }),
  limits: GIOI_HAN,
  fileFilter: locAnh,
});

// Nhận file vào thư mục con với tên TẠM; tên chính thức đặt bởi luuAnh() khi đã biết mã (cơ sở / người dùng).
const taoTaiAnh = (thuMuc) => multer({
  storage: multer.diskStorage({
    destination: path.join(thuMucTepTaiLen, thuMuc),
    filename: (_req, tep, goiLai) =>
      goiLai(null, `tam-${crypto.randomBytes(8).toString('hex')}.${DUOI_THEO_MIME[tep.mimetype]}`),
  }),
  limits: GIOI_HAN,
  fileFilter: locAnh,
});
const taiAnhDaiDien = taoTaiAnh('avatar');
const taiAnhCoSo = taoTaiAnh('coso');
const taiAnhSuKien = taoTaiAnh('su-kien');

const layDuongDanTep = (tep) => (tep ? `${TIEN_TO_URL}/${tep.filename}` : null);

// Chữ ký đầu file: chặn file không phải ảnh dù đổi đuôi/mime.
async function laAnhThat(duongDanTep) {
  const tep = await fs.open(duongDanTep, 'r');
  try {
    const dem = Buffer.alloc(12);
    await tep.read(dem, 0, 12, 0);
    const laJpeg = dem[0] === 0xff && dem[1] === 0xd8 && dem[2] === 0xff;
    const laPng = dem.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const laWebp = dem.subarray(0, 4).toString('ascii') === 'RIFF' && dem.subarray(8, 12).toString('ascii') === 'WEBP';
    return laJpeg || laPng || laWebp;
  } finally {
    await tep.close();
  }
}

// Tên chính thức: <tiềnTố>-<ms>-<4hex>.<đuôi>. Trả về đường dẫn tương đối để lưu DB.
const taoTenAnh = (tienTo, duoi) => `${tienTo}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}.${duoi}`;

// Kiểm chữ ký ảnh rồi đổi tên tạm → tên theo quy tắc. Lỗi → xoá file tạm.
async function luuAnh(tep, thuMuc, tienTo) {
  try {
    if (!await laAnhThat(tep.path)) {
      throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
        { truong: 'tepAnh', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' }]);
    }
    const ten = taoTenAnh(tienTo, DUOI_THEO_MIME[tep.mimetype]);
    await fs.rename(tep.path, path.join(thuMucTepTaiLen, thuMuc, ten));
    return `${TIEN_TO_URL}/${thuMuc}/${ten}`;
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {});
    throw loi;
  }
}

// Xoá file ảnh theo đường dẫn DB. Chỉ đụng avatar/ và coso/, tuyệt đối không xoá ảnh mặc định.
async function xoaAnh(duongDan) {
  if (!duongDan || Object.values(ANH_MAC_DINH).includes(duongDan)) return;
  const m = /^\/tep-tai-len\/(avatar|coso)\/([\w.-]+)$/.exec(duongDan);
  if (!m) return;
  await fs.unlink(path.join(thuMucTepTaiLen, m[1], m[2])).catch(() => {});
}

async function xoaAnhSuKien(duongDan) {
  const m = /^\/tep-tai-len\/su-kien\/([\w.-]+)$/.exec(duongDan || '');
  if (!m) return;
  await fs.unlink(path.join(thuMucTepTaiLen, 'su-kien', m[1])).catch(() => {});
}

module.exports = {
  taiTep, taiAnhDaiDien, taiAnhCoSo, taiAnhSuKien, layDuongDanTep, thuMucTepTaiLen,
  ANH_MAC_DINH, laAnhThat, luuAnh, xoaAnh, xoaAnhSuKien, taoTenAnh,
};
