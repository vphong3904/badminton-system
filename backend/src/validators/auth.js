const { z } = require('zod');

const truongCoSo = {
  tenDangNhap: z.string().trim().min(4).max(50).regex(/^[a-zA-Z0-9_.]+$/, 'Chỉ gồm chữ, số, _ và .'),
  matKhau: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(72),
  hoTen: z.string().trim().min(2).max(100),
  soDienThoai: z.string().trim().regex(/^(0|\+84)\d{9,10}$/, 'Số điện thoại không hợp lệ'),
  email: z.string().trim().toLowerCase().email().max(120),
};

exports.dangKy = { body: z.object(truongCoSo) };
exports.dangNhap = {
  body: z.object({ tenDangNhap: z.string().trim().min(1), matKhau: z.string().min(1) }),
};
exports.doiMatKhau = {
  body: z.object({ matKhauCu: z.string().min(1), matKhauMoi: truongCoSo.matKhau }),
};
exports.capNhatThongTinCaNhan = {
  body: z.object({
    hoTen: truongCoSo.hoTen,
    soDienThoai: truongCoSo.soDienThoai,
    email: truongCoSo.email,
  }).partial().refine((duLieu) => Object.keys(duLieu).length > 0, 'Không có dữ liệu cập nhật'),
};
