/** Màn hình Nhật ký hệ thống */
import { useEffect, useState } from 'react';
import { layNhatKy } from '../api/admin';
import { dinhDangNgayGio, nhanHanhDong } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';

const BO_LOC_MAC_DINH = { tuNgay: '', denNgay: '', gioiHan: '50' };

export default function Logs() {
  const [nhap, setNhap] = useState(BO_LOC_MAC_DINH);
  const [boLoc, setBoLoc] = useState(BO_LOC_MAC_DINH);
  const [loiNhap, setLoiNhap] = useState('');
  const [nhatKys, setNhatKys] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);

  useEffect(() => {
    let daHuy = false;
    layNhatKy({ tuNgay: boLoc.tuNgay, denNgay: boLoc.denNgay, gioiHan: boLoc.gioiHan })
      .then((duLieu) => {
        if (daHuy) return;
        setNhatKys(duLieu);
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
  }, [boLoc, lanTai]);

  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    setLanTai((n) => n + 1);
  };

  const apDung = (suKien) => {
    suKien.preventDefault();
    const gioiHan = Number(nhap.gioiHan);
    if (!Number.isInteger(gioiHan) || gioiHan < 1 || gioiHan > 100) {
      setLoiNhap('Số bản ghi tối đa phải là số nguyên từ 1 đến 100');
      return;
    }
    if (nhap.tuNgay && nhap.denNgay && nhap.tuNgay > nhap.denNgay) {
      setLoiNhap('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      return;
    }
    setLoiNhap('');
    setDangTai(true);
    setBoLoc({ ...nhap, gioiHan: String(gioiHan) });
  };

  const datLai = () => {
    setNhap(BO_LOC_MAC_DINH);
    setLoiNhap('');
    setDangTai(true);
    setBoLoc(BO_LOC_MAC_DINH);
  };

  const lopNhap =
    'bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#165137]';

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Nhật ký hệ thống</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">Các thao tác quản trị đã thực hiện, mới nhất ở trên cùng.</p>
      </div>

      <form onSubmit={apDung} className="flex flex-wrap items-end gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm text-xs">
        <div className="space-y-1">
          <label htmlFor="tuNgay" className="block font-bold text-slate-600">Từ ngày</label>
          <input id="tuNgay" type="date" value={nhap.tuNgay} onChange={(e) => setNhap({ ...nhap, tuNgay: e.target.value })} className={lopNhap} />
        </div>
        <div className="space-y-1">
          <label htmlFor="denNgay" className="block font-bold text-slate-600">Đến ngày</label>
          <input id="denNgay" type="date" value={nhap.denNgay} onChange={(e) => setNhap({ ...nhap, denNgay: e.target.value })} className={lopNhap} />
        </div>
        <div className="space-y-1">
          <label htmlFor="gioiHan" className="block font-bold text-slate-600">Số bản ghi tối đa (1–100)</label>
          <input
            id="gioiHan"
            type="number"
            min="1"
            max="100"
            value={nhap.gioiHan}
            onChange={(e) => setNhap({ ...nhap, gioiHan: e.target.value })}
            className={`${lopNhap} w-24`}
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold rounded-xl shadow-sm transition">
          Lọc nhật ký
        </button>
        <button type="button" onClick={datLai} className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition">
          Đặt lại
        </button>
        {loiNhap && (
          <p role="alert" className="basis-full text-rose-600 font-semibold">
            {loiNhap}
          </p>
        )}
      </form>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : nhatKys.length === 0 ? (
        <EmptyState noiDung="Không có bản ghi nào trong khoảng đã chọn." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-5">Thời gian</th>
                <th className="py-4 px-5">Người thực hiện</th>
                <th className="py-4 px-5">Hành động</th>
                <th className="py-4 px-5">Đối tượng</th>
                <th className="py-4 px-5">Mã đối tượng</th>
                <th className="py-4 px-5">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {nhatKys.map((nk) => (
                <tr key={nk.maNhatKy} className="hover:bg-slate-50/50 align-top">
                  <td className="py-3.5 px-5 whitespace-nowrap text-slate-600">{dinhDangNgayGio(nk.ngayTao)}</td>
                  <td className="py-3.5 px-5">{nk.tenNguoiThucHien || '—'}</td>
                  <td className="py-3.5 px-5 font-bold text-slate-900">{nhanHanhDong(nk.hanhDong)}</td>
                  <td className="py-3.5 px-5">{nk.doiTuong || '—'}</td>
                  <td className="py-3.5 px-5">{nk.maDoiTuong ?? '—'}</td>
                  <td className="py-3.5 px-5 max-w-xs break-words">{nk.chiTiet || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
