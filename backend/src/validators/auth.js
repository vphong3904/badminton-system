const { z } = require('zod');
const quyTac = require('./quyTac');

// Luật từng trường trùng với FE (docs/agent/05-validation.md, frontend/lib/core/utils/validators.dart).
const truongCoSo = {
  matKhau: quyTac.matKhauMoi,
  hoTen: quyTac.hoTen,
  soDienThoai: quyTac.soDienThoaiDiDong,
  email: quyTac.email,
};

exports.dangKy = { body: z.object(truongCoSo) };
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
    // Giữ luật "10–11 số" ở đây để tài khoản cũ lưu lại số cũ không đổi vẫn sửa được hồ sơ;
    // nếu SĐT bị ĐỔI thì authService bắt buộc số di động (giống FE edit_profile_screen).
    soDienThoai: quyTac.soDienThoaiLienHe,
    email: quyTac.email,
  }).partial().refine((duLieu) => Object.keys(duLieu).length > 0, 'Không có dữ liệu cập nhật'),
};
