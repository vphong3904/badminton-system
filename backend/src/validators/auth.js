const { z } = require('zod');
const quyTac = require('./quyTac');
const { timNganHang } = require('../utils/nganHang');

// Luật từng trường trùng với FE (docs/agent/05-validation.md, frontend/lib/core/utils/validators.dart).
const truongCoSo = {
  matKhau: quyTac.matKhauMoi,
  hoTen: quyTac.hoTen,
  soDienThoai: quyTac.soDienThoaiDiDong,
  email: quyTac.email,
};

exports.dangKy = { body: z.object(truongCoSo) };

// Đăng ký chủ sân: thêm tên doanh nghiệp + tài khoản nhận tiền + xác nhận mật khẩu.
// maNganHang phải nằm trong danh sách ngân hàng của BE (tên ngân hàng BE tự lấy theo mã).
const maNganHang = z.string({ error: 'Vui lòng chọn ngân hàng.' }).trim()
  .min(1, 'Vui lòng chọn ngân hàng.')
  .refine((giaTri) => !!timNganHang(giaTri), 'Ngân hàng không hợp lệ.');
const tenDoanhNghiep = z.string({ error: 'Vui lòng nhập tên doanh nghiệp.' })
  .transform((giaTri) => giaTri.normalize('NFC').trim().replace(/\s+/g, ' '))
  .pipe(z.string().superRefine((giaTri, nguCanh) => {
    const loi = !giaTri ? 'Vui lòng nhập tên doanh nghiệp.'
      : giaTri.length < 2 ? 'Tên doanh nghiệp tối thiểu 2 ký tự.'
        : giaTri.length > 150 ? 'Tên doanh nghiệp tối đa 150 ký tự.' : null;
    if (loi) nguCanh.addIssue({ code: 'custom', message: loi });
  }));
const soTaiKhoan = z.string({ error: 'Vui lòng nhập số tài khoản.' })
  .transform((giaTri) => giaTri.replace(/\s+/g, ''))
  .pipe(z.string().superRefine((giaTri, nguCanh) => {
    const loi = !giaTri ? 'Vui lòng nhập số tài khoản.'
      : !/^\d{6,20}$/.test(giaTri) ? 'Số tài khoản gồm 6–20 chữ số.' : null;
    if (loi) nguCanh.addIssue({ code: 'custom', message: loi });
  }));
const xacNhanMatKhau = z.string({ error: 'Vui lòng xác nhận mật khẩu.' })
  .min(1, 'Vui lòng xác nhận mật khẩu.');

exports.dangKyChuSan = {
  body: z.object({
    ...truongCoSo,
    tenDoanhNghiep,
    maNganHang,
    soTaiKhoan,
    xacNhanMatKhau,
  }).refine((duLieu) => duLieu.matKhau === duLieu.xacNhanMatKhau, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['xacNhanMatKhau'],
  }),
};
exports.dangNhap = {
  body: z.object({
    // Đăng nhập bằng email (mọi vai trò): chỉ bắt buộc, không nêu chính sách định dạng.
    email: z.string({ error: 'Vui lòng nhập email.' }).trim().toLowerCase()
      .min(1, 'Vui lòng nhập email.').max(120),
    matKhau: z.string({ error: 'Vui lòng nhập mật khẩu.' }).min(1, 'Vui lòng nhập mật khẩu.'),
  }),
};
exports.doiMatKhau = {
  body: z.object({
    matKhauCu: z.string({ error: 'Vui lòng nhập mật khẩu hiện tại.' }).min(1, 'Vui lòng nhập mật khẩu hiện tại.'),
    matKhauMoi: quyTac.matKhauMoi,
  }).refine((duLieu) => duLieu.matKhauMoi !== duLieu.matKhauCu, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    path: ['matKhauMoi'],
  }),
};
exports.capNhatThongTinCaNhan = {
  body: z.object({
    hoTen: quyTac.hoTen,
    // Giữ luật số liên hệ (di động 10 số hoặc số bàn 11 số) ở đây để tài khoản cũ lưu lại số cũ không đổi vẫn sửa được hồ sơ;
    // nếu SĐT bị ĐỔI thì authService bắt buộc số di động (giống FE edit_profile_screen).
    soDienThoai: quyTac.soDienThoaiLienHe,
    email: quyTac.email,
  }).partial().refine((duLieu) => Object.keys(duLieu).length > 0, 'Không có dữ liệu cập nhật'),
};
