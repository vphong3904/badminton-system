const { z } = require('zod');

const base = {
  username: z.string().trim().min(4).max(50).regex(/^[a-zA-Z0-9_.]+$/, 'Chỉ gồm chữ, số, _ và .'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(72),
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^(0|\+84)\d{9,10}$/, 'Số điện thoại không hợp lệ'),
  email: z.string().trim().toLowerCase().email().max(120),
};

exports.register = { body: z.object(base) };
exports.login = {
  body: z.object({ username: z.string().trim().min(1), password: z.string().min(1) }),
};
exports.changePassword = {
  body: z.object({ old_password: z.string().min(1), new_password: base.password }),
};
exports.updateMe = {
  body: z.object({ full_name: base.full_name, phone: base.phone, email: base.email }).partial()
    .refine((o) => Object.keys(o).length > 0, 'Không có dữ liệu cập nhật'),
};
