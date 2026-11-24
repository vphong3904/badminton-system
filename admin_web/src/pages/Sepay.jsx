/** Màn hình Đối soát SePay: giao dịch tiền vào chưa tự khớp với đơn (chỉ xem) */
import { useEffect, useState } from 'react';
import { layGiaoDichSepayChuaKhop } from '../api/admin';
import { dinhDangTien, dinhDangNgayGio, nhanTrangThaiDoiSoat } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';

export default function Sepay() {
  const [giaoDichs, setGiaoDichs] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [loc, setLoc] = useState('tatCa');

  useEffect(() => {
    let daHuy = false;
    layGiaoDichSepayChuaKhop()
      .then((duLieu) => {
        if (daHuy) return;
        setGiaoDichs(duLieu);
        setLoi('');
        setDangTai(false);
      })
      .catch((e) => {
        if (daHuy) return;
        setLoi(e.message);
        setDangTai(false);
      });
    return () => {
      daHuy = true;
    };
  }, [lanTai]);

  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    setLanTai((n) => n + 1);
  };

  const cacTrangThai = [...new Set(giaoDichs.map((gd) => gd.trangThaiDoiSoat))];
  const hienThi = loc === 'tatCa' ? giaoDichs : giaoDichs.filter((gd) => gd.trangThaiDoiSoat === loc);

  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Đối soát SePay</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Tiền vào mà hệ thống chưa tự khớp được với đơn. Hiển thị tối đa 100 giao dịch gần nhất, chỉ để theo dõi.
          </p>
        </div>
        {!dangTai && !loi && giaoDichs.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="loc-trang-thai" className="font-semibold text-slate-600">
              Lọc theo trạng thái
            </label>
            <select
              id="loc-trang-thai"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#165137]"
            >
              <option value="tatCa">Tất cả ({giaoDichs.length})</option>
              {cacTrangThai.map((trangThai) => (
                <option key={trangThai} value={trangThai}>
                  {nhanTrangThaiDoiSoat(trangThai).nhan} ({giaoDichs.filter((gd) => gd.trangThaiDoiSoat === trangThai).length})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : giaoDichs.length === 0 ? (
        <EmptyState noiDung="Mọi giao dịch đều đã được đối soát." />
      ) : hienThi.length === 0 ? (
        <EmptyState noiDung="Không có giao dịch nào ở trạng thái này." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-5">Mã GD SePay</th>
                <th className="py-4 px-5">Mã GD ngân hàng</th>
                <th className="py-4 px-5">Tài khoản</th>
                <th className="py-4 px-5">Loại</th>
                <th className="py-4 px-5">Số tiền</th>
                <th className="py-4 px-5">Nội dung chuyển khoản</th>
                <th className="py-4 px-5">Mã đối soát</th>
                <th className="py-4 px-5">Ngày giao dịch</th>
                <th className="py-4 px-5">Ngày nhận</th>
                <th className="py-4 px-5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {hienThi.map((gd) => {
                const trangThai = nhanTrangThaiDoiSoat(gd.trangThaiDoiSoat);
                return (
                  <tr key={String(gd.maGiaoDichSePay)} className="hover:bg-slate-50/50 align-top">
                    <td className="py-3.5 px-5 font-mono text-[11px]">{String(gd.maGiaoDichSePay)}</td>
                    <td className="py-3.5 px-5 font-mono text-[11px]">{gd.maGiaoDichNganHang || '—'}</td>
                    <td className="py-3.5 px-5 font-mono text-[11px]">{gd.soTaiKhoan || '—'}</td>
                    <td className="py-3.5 px-5">{gd.loaiGiaoDich || '—'}</td>
                    <td className="py-3.5 px-5 font-bold text-slate-900 whitespace-nowrap">{dinhDangTien(gd.soTien)}</td>
                    <td className="py-3.5 px-5 max-w-xs break-words">{gd.noiDung || '—'}</td>
                    <td className="py-3.5 px-5 font-mono text-[11px]">{gd.maDoiSoat || '—'}</td>
                    <td className="py-3.5 px-5 whitespace-nowrap text-slate-600">{dinhDangNgayGio(gd.ngayGiaoDich)}</td>
                    <td className="py-3.5 px-5 whitespace-nowrap text-slate-600">{dinhDangNgayGio(gd.ngayNhan)}</td>
                    <td className="py-3.5 px-5">
                      <StatusBadge nhan={trangThai.nhan} mau={trangThai.mau} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
