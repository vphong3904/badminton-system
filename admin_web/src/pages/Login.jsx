/** Màn hình Đăng nhập quản trị (không có đăng ký) */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Điền sẵn tài khoản như bản cũ (câu hỏi Q5). Muốn để trống thì đổi cả hai thành ''
const TAI_KHOAN_MAC_DINH = 'admin@badminton.vn';
const MAT_KHAU_MAC_DINH = 'password123';

export default function Login() {
  const { dangNhap, thongBaoPhien } = useAuth();
  const [tenDangNhap, setTenDangNhap] = useState(TAI_KHOAN_MAC_DINH);
  const [matKhau, setMatKhau] = useState(MAT_KHAU_MAC_DINH);
  const [ghiNho, setGhiNho] = useState(true);
  const [hienMatKhau, setHienMatKhau] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [loiTruong, setLoiTruong] = useState({});

  const guiDangNhap = async (suKien) => {
    suKien.preventDefault();
    const loiMoi = {};
    if (!tenDangNhap.trim()) loiMoi.tenDangNhap = 'Nhập email hoặc tên đăng nhập';
    if (!matKhau) loiMoi.matKhau = 'Nhập mật khẩu';
    setLoiTruong(loiMoi);
    setLoi('');
    if (Object.keys(loiMoi).length) return;

    setDangGui(true);
    try {
      await dangNhap(tenDangNhap.trim(), matKhau, ghiNho);
    } catch (e) {
      const loiTuMayChu = {};
      if (Array.isArray(e.chiTiet)) {
        e.chiTiet.forEach((muc) => {
          if (muc.truong) loiTuMayChu[muc.truong] = muc.thongBao;
        });
      }
      setLoiTruong(loiTuMayChu);
      setLoi(e.message);
      setDangGui(false);
    }
  };

  const lopNhap = (coLoi) =>
    `w-full bg-[#050b18] border rounded-2xl px-4 py-3.5 text-white font-medium focus:outline-none focus:ring-1 transition ${
      coLoi ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-slate-800/80 focus:border-emerald-500 focus:ring-emerald-500'
    }`;

  return (
    <div className="min-h-screen w-full bg-[#0b1329] flex flex-col justify-center items-center p-4 font-sans antialiased text-slate-100">
      <div className="w-full max-w-md space-y-6 my-auto py-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Đăng nhập quản trị</h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Dành cho quản trị viên Badminton Booking. Nhập email và mật khẩu để tiếp tục.
          </p>
        </div>

        {thongBaoPhien && (
          <p role="alert" className="text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-2xl px-4 py-3">
            {thongBaoPhien}
          </p>
        )}

        <form onSubmit={guiDangNhap} className="space-y-5 text-xs" noValidate>
          <div>
            <label htmlFor="tenDangNhap" className="block font-semibold text-slate-300 mb-2">
              Email hoặc tên đăng nhập
            </label>
            <input
              id="tenDangNhap"
              type="text"
              autoComplete="username"
              autoFocus
              value={tenDangNhap}
              onChange={(e) => setTenDangNhap(e.target.value)}
              placeholder="admin@badminton.vn"
              className={lopNhap(loiTruong.tenDangNhap)}
            />
            {loiTruong.tenDangNhap && <p className="mt-1.5 text-rose-400 font-semibold">{loiTruong.tenDangNhap}</p>}
          </div>

          <div>
            <label htmlFor="matKhau" className="block font-semibold text-slate-300 mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="matKhau"
                type={hienMatKhau ? 'text' : 'password'}
                autoComplete="current-password"
                value={matKhau}
                onChange={(e) => setMatKhau(e.target.value)}
                placeholder="••••••••"
                className={`${lopNhap(loiTruong.matKhau)} pr-16`}
              />
              <button
                type="button"
                onClick={() => setHienMatKhau(!hienMatKhau)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 font-semibold"
              >
                {hienMatKhau ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            {loiTruong.matKhau && <p className="mt-1.5 text-rose-400 font-semibold">{loiTruong.matKhau}</p>}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200 w-fit">
            <input
              type="checkbox"
              checked={ghiNho}
              onChange={(e) => setGhiNho(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>

          {loi && (
            <p role="alert" className="font-semibold text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-2xl px-4 py-3">
              {loi}
            </p>
          )}

          <button
            type="submit"
            disabled={dangGui}
            className="w-full py-3.5 bg-[#165137] hover:bg-emerald-800 disabled:opacity-60 font-extrabold text-white rounded-2xl shadow-lg shadow-emerald-950/40 transition duration-150 text-sm"
          >
            {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
