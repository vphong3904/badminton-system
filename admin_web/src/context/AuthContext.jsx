/** Trạng thái đăng nhập dùng chung toàn ứng dụng */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { datHamKhiHetPhien } from '../api/client';
import { dangNhapWeb, layCaNhan } from '../api/auth';
import { layToken, luuToken, xoaToken } from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [nguoiDung, setNguoiDung] = useState(null);
  // Chỉ cần khôi phục phiên khi trình duyệt đang giữ token
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(() => Boolean(layToken()));
  const [thongBaoPhien, setThongBaoPhien] = useState('');

  const ketThucPhien = useCallback((lyDo) => {
    xoaToken();
    setNguoiDung(null);
    setThongBaoPhien(lyDo);
  }, []);

  // Khi bất kỳ API nào trả 401: đăng xuất và về trang đăng nhập
  useEffect(() => {
    datHamKhiHetPhien(() => ketThucPhien('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'));
  }, [ketThucPhien]);

  // Khôi phục phiên khi tải lại trang
  useEffect(() => {
    if (!layToken()) return undefined;
    let daHuy = false;
    layCaNhan()
      .then((thongTin) => {
        if (daHuy) return;
        if (thongTin.vaiTro === 'admin') {
          setNguoiDung(thongTin);
        } else {
          xoaToken();
          setThongBaoPhien('Tài khoản không có quyền quản trị.');
        }
      })
      .catch((loi) => {
        // 401 đã được lớp gọi API xử lý (tự đăng xuất)
        if (!daHuy && loi.maTrangThai !== 401) setThongBaoPhien(loi.message);
      })
      .finally(() => {
        if (!daHuy) setDangKhoiPhuc(false);
      });
    return () => {
      daHuy = true;
    };
  }, []);

  const dangNhap = useCallback(async (tenDangNhap, matKhau, ghiNho) => {
    const ketQua = await dangNhapWeb(tenDangNhap, matKhau);
    if (ketQua.nguoiDung.vaiTro !== 'admin') {
      throw new Error('Tài khoản không có quyền quản trị.');
    }
    luuToken(ketQua.maTruyCap, ghiNho);
    setThongBaoPhien('');
    setNguoiDung(ketQua.nguoiDung);
  }, []);

  const dangXuat = useCallback(() => ketThucPhien(''), [ketThucPhien]);

  const giaTri = useMemo(
    () => ({ nguoiDung, dangKhoiPhuc, thongBaoPhien, dangNhap, dangXuat }),
    [nguoiDung, dangKhoiPhuc, thongBaoPhien, dangNhap, dangXuat],
  );

  return <AuthContext.Provider value={giaTri}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const giaTri = useContext(AuthContext);
  if (!giaTri) throw new Error('useAuth phải nằm trong AuthProvider');
  return giaTri;
}
