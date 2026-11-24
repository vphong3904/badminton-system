/** File chính: chưa đăng nhập → trang Đăng nhập; đã đăng nhập → khung quản trị + một màn hình theo tab */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { layHoSoChoDuyet, layKhieuNai, layDonChoXacNhan } from './api/admin';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Owners from './pages/Owners';
import Users from './pages/Users';
import Complaints from './pages/Complaints';
import Reviews from './pages/Reviews';
import PaymentProofs from './pages/PaymentProofs';
import Logs from './pages/Logs';

import Header from './components/Header';
import Sidebar from './components/Sidebar';

/** Khung quản trị. Được gắn lại mỗi lần đăng nhập nên tab luôn bắt đầu ở Tổng quan */
function KhungQuanTri({ nguoiDung, dangXuat }) {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [soChoXuLy, setSoChoXuLy] = useState({});
  const [lanDem, setLanDem] = useState(0);

  // Đếm số việc chờ xử lý để hiện huy hiệu ở menu; lỗi thì bỏ qua (không có huy hiệu)
  useEffect(() => {
    let daHuy = false;
    Promise.allSettled([
      layHoSoChoDuyet(),
      layKhieuNai({ trangThai: 'pending', gioiHan: 100 }),
      layDonChoXacNhan(),
    ]).then(
      ([hoSo, khieuNai, choXacNhan]) => {
        if (daHuy) return;
        setSoChoXuLy({
          owners: hoSo.status === 'fulfilled' ? hoSo.value.length : undefined,
          complaints: khieuNai.status === 'fulfilled' ? khieuNai.value.length : undefined,
          proofs: choXacNhan.status === 'fulfilled' ? choXacNhan.value.length : undefined,
        });
      },
    );
    return () => {
      daHuy = true;
    };
  }, [currentTab, lanDem]);

  const lamMoiSoDem = useCallback(() => setLanDem((n) => n + 1), []);

  return (
    <div className="h-screen flex flex-col bg-[#f4f7f5] text-slate-800 font-sans antialiased overflow-hidden">
      <Header tenAdmin={nguoiDung.hoTen} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          tabHienTai={currentTab}
          doiTab={setCurrentTab}
          soChoXuLy={soChoXuLy}
          nguoiDung={nguoiDung}
          khiDangXuat={dangXuat}
        />

        <main className="flex-1 overflow-y-auto p-8">
          {currentTab === 'dashboard' && <Dashboard doiTab={setCurrentTab} />}
          {currentTab === 'users' && <Users />}
          {currentTab === 'owners' && <Owners khiThayDoi={lamMoiSoDem} />}
          {currentTab === 'complaints' && <Complaints khiThayDoi={lamMoiSoDem} />}
          {currentTab === 'reviews' && <Reviews />}
          {currentTab === 'proofs' && <PaymentProofs khiThayDoi={lamMoiSoDem} />}
          {currentTab === 'logs' && <Logs />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { nguoiDung, dangKhoiPhuc, dangXuat } = useAuth();

  if (dangKhoiPhuc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1329] text-xs font-semibold text-slate-400" role="status">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

  if (!nguoiDung) return <Login />;

  return <KhungQuanTri nguoiDung={nguoiDung} dangXuat={dangXuat} />;
}
