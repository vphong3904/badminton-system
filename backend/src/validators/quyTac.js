const { z } = require('zod');

// Luật kiểm đầu vào DÙNG CHUNG với FE (frontend/lib/core/utils/validators.dart).
// Mỗi hàm trả về thông báo lỗi tiếng Việt hoặc null. Thứ tự kiểm và câu chữ phải
// giống hệt FE: bắt buộc → định dạng → độ dài. Đổi một bên thì đổi bên kia + 05-validation.md.

const MAU_TEN = /^\p{L}[\p{L}\s'.-]*$/u;
const MAU_EMAIL_CO_BAN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAU_EMAIL_CHAT = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const MAU_DI_DONG = /^0[35789]\d{8}$/;
const MAU_LIEN_HE = /^0\d{9,10}$/;
// Ký tự người dùng được gõ trong ô SĐT; chữ cái hay ký hiệu lạ bị từ chối thay vì bị lặng lẽ bỏ đi.
const MAU_KY_TU_SDT = /^\+?[\d\s.()-]+$/;

// Giống AuthApi.normalizePhone ở FE: '+84 912 345 678' / '912345678' → '0912345678'.
function chuanHoaSoDienThoai(goc) {
  let chuSo = String(goc ?? '').replace(/[^0-9]/g, '');
  if (chuSo.startsWith('84') && chuSo.length >= 11) chuSo = chuSo.slice(2);
  if (chuSo && !chuSo.startsWith('0')) chuSo = `0${chuSo}`;
  return chuSo;
}

function gonKhoangTrang(giaTri) {
  return String(giaTri ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

function kiemTraHoTen(giaTri) {
  const chu = gonKhoangTrang(giaTri);
  if (!chu) return 'Vui lòng nhập họ và tên.';
  if (chu.length < 2) return 'Họ tên tối thiểu 2 ký tự.';
  if (chu.length > 100) return 'Họ tên tối đa 100 ký tự.';
  if (!MAU_TEN.test(chu)) return 'Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.';
  return null;
}

function kiemTraTenKhachDat(giaTri) {
  const chu = String(giaTri ?? '').trim();
  if (chu.length < 2) return 'Vui lòng nhập tên (tối thiểu 2 ký tự).';
  if (chu.length > 100) return 'Họ tên tối đa 100 ký tự.';
  return null;
}

function kiemTraEmail(giaTri) {
  const chu = String(giaTri ?? '').trim();
  if (!chu) return 'Vui lòng nhập email.';
  if (!MAU_EMAIL_CO_BAN.test(chu) || !MAU_EMAIL_CHAT.test(chu) || chu.includes('..')) {
    return 'Email không hợp lệ.';
  }
  if (chu.length > 120) return 'Email tối đa 120 ký tự.';
  return null;
}

function kiemTraSoDiDong(giaTri) {
  const chu = String(giaTri ?? '').trim();
  if (!chu) return 'Vui lòng nhập số điện thoại.';
  if (!MAU_KY_TU_SDT.test(chu) || !MAU_DI_DONG.test(chuanHoaSoDienThoai(chu))) {
    return 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.';
  }
  return null;
}

function kiemTraSoLienHe(giaTri) {
  const chu = String(giaTri ?? '').trim();
  if (!chu) return 'Vui lòng nhập số điện thoại.';
  if (!MAU_KY_TU_SDT.test(chu) || !MAU_LIEN_HE.test(chuanHoaSoDienThoai(chu))) {
    return 'Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).';
  }
  return null;
}

function kiemTraMatKhauMoi(giaTri) {
  const chu = String(giaTri ?? '');
  if (!chu) return 'Vui lòng nhập mật khẩu.';
  if (chu.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (chu.length > 72) return 'Mật khẩu tối đa 72 ký tự.';
  if (/\s/.test(chu)) return 'Mật khẩu không được chứa khoảng trắng.';
  if (!/[A-Za-z]/.test(chu) || !/\d/.test(chu)) return 'Mật khẩu cần có cả chữ và số.';
  return null;
}

function kiemTraGhiChu(giaTri) {
  if (String(giaTri ?? '').trim().length > 500) return 'Ghi chú tối đa 500 ký tự.';
  return null;
}

// Dựng schema zod từ một hàm kiểm: lỗi đầu tiên là thông báo (đúng như FE), hợp lệ thì chuẩn hoá giá trị.
function tuHamKiem(hamKiem, hamChuanHoa, thongBaoThieu) {
  return z.string({ error: thongBaoThieu })
    .superRefine((giaTri, nguCanh) => {
      const loi = hamKiem(giaTri);
      if (loi) nguCanh.addIssue({ code: 'custom', message: loi });
    })
    .transform(hamChuanHoa);
}

const hoTen = tuHamKiem(kiemTraHoTen, gonKhoangTrang, 'Vui lòng nhập họ và tên.');
const tenKhachDat = tuHamKiem(kiemTraTenKhachDat, (g) => g.trim(), 'Vui lòng nhập tên (tối thiểu 2 ký tự).');
const email = tuHamKiem(kiemTraEmail, (g) => g.trim().toLowerCase(), 'Vui lòng nhập email.');
const soDienThoaiDiDong = tuHamKiem(kiemTraSoDiDong, chuanHoaSoDienThoai, 'Vui lòng nhập số điện thoại.');
const soDienThoaiLienHe = tuHamKiem(kiemTraSoLienHe, chuanHoaSoDienThoai, 'Vui lòng nhập số điện thoại.');
const matKhauMoi = tuHamKiem(kiemTraMatKhauMoi, (g) => g, 'Vui lòng nhập mật khẩu.');
const ghiChu = tuHamKiem(kiemTraGhiChu, (g) => g.trim(), 'Ghi chú tối đa 500 ký tự.');

module.exports = {
  MAU_DI_DONG,
  chuanHoaSoDienThoai,
  kiemTraSoDiDong,
  hoTen,
  tenKhachDat,
  email,
  soDienThoaiDiDong,
  soDienThoaiLienHe,
  matKhauMoi,
  ghiChu,
};
