/** Màn hình Quản lý tài khoản: danh sách khách hàng / chủ sân, tìm kiếm, khóa (bắt buộc lý do) và mở khóa */
import { useCallback, useEffect, useState } from 'react';
import { layNguoiDung, khoaTaiKhoan, moKhoaTaiKhoan } from '../api/admin';
import { dinhDangNgayGio } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const SO_DONG = 20;
const TAB_VAI_TRO = [
  { ma: 'customer', nhan: 'Khách hàng' },
  { ma: 'owner', nhan: 'Chủ sân' },
];
const LOC_TRANG_THAI = [
  { ma: 'all', nhan: 'Tất cả trạng thái' },
  { ma: 'active', nhan: 'Đang hoạt động' },
  { ma: 'locked', nhan: 'Đã khóa' },
];
const TRANG_THAI_DUYET = {
  approved: { nhan: 'Đã duyệt', mau: 'xanh' },
  pending: { nhan: 'Chờ duyệt', mau: 'vang' },
  rejected: { nhan: 'Bị từ chối', mau: 'do' },
};

export default function Users() {
  const [boLoc, setBoLoc] = useState({ vaiTro: 'customer', trangThai: 'all', tuKhoa: '', trang: 1 });
  const [tuKhoaNhap, setTuKhoaNhap] = useState('');
  const [duLieu, setDuLieu] = useState(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'khoa' | 'moKhoa', taiKhoan }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layNguoiDung({ ...boLoc, soLuong: SO_DONG })
      .then((ketQua) => {
        if (daHuy) return;
        setDuLieu(ketQua);
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

  const doiBoLoc = useCallback((phan) => {
    setDangTai(true);
    setLoi('');
    setBoLoc((cu) => ({ ...cu, trang: 1, ...phan }));
  }, []);

  // Ô tìm kiếm: gõ xong khoảng 0,4 giây mới gọi máy chủ
  useEffect(() => {
    const hen = setTimeout(() => {
      const tuKhoa = tuKhoaNhap.trim();
      if (tuKhoa !== boLoc.tuKhoa) doiBoLoc({ tuKhoa });
    }, 400);
    return () => clearTimeout(hen);
  }, [tuKhoaNhap, boLoc.tuKhoa, doiBoLoc]);

  const lamMoi = () => setLanTai((n) => n + 1);
  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    lamMoi();
  };
  const doiTrang = (trang) => {
    setDangTai(true);
    setBoLoc((cu) => ({ ...cu, trang }));
  };

  const moHopThoai = (loai, taiKhoan) => {
    setLoiHopThoai('');
    setHanhDong({ loai, taiKhoan });
  };

  const xacNhan = async (lyDo) => {
    const { loai, taiKhoan } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      if (loai === 'khoa') await khoaTaiKhoan(taiKhoan.maNguoiDung, lyDo);
      else await moKhoaTaiKhoan(taiKhoan.maNguoiDung);
      setToast({
        loai: 'thanhCong',
        noiDung: loai === 'khoa' ? `Đã khóa tài khoản của ${taiKhoan.hoTen}` : `Đã mở khóa tài khoản của ${taiKhoan.hoTen}`,
      });
      setHanhDong(null);
      lamMoi();
    } catch (e) {
      if (e.maTrangThai === 409) {
        setHanhDong(null);
        setToast({ loai: 'loi', noiDung: `${e.message} Danh sách đã được tải lại.` });
        lamMoi();
      } else {
        setLoiHopThoai(e.message);
      }
    } finally {
      setDangXuLy(false);
    }
  };

  const laChuSan = boLoc.vaiTro === 'owner';
  const cacTaiKhoan = duLieu?.cacTaiKhoan || [];
  const tongTrang = duLieu ? Math.max(1, Math.ceil(duLieu.tong / duLieu.soDongMoiTrang)) : 1;
  const tenVaiTro = laChuSan ? 'chủ sân' : 'khách hàng';
  const dangKhoa = hanhDong?.loai === 'khoa';

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Quản lý tài khoản</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Xem tài khoản khách hàng và chủ sân. Khóa tài khoản vi phạm (bắt buộc nhập lý do) hoặc mở khóa khi cần.
        </p>
      </div>

      <div className="flex border-b border-slate-200">
        {TAB_VAI_TRO.map((tab) => (
          <button
            key={tab.ma}
            type="button"
            onClick={() => {
              if (boLoc.vaiTro !== tab.ma) doiBoLoc({ vaiTro: tab.ma, trangThai: 'all' });
            }}
            aria-current={boLoc.vaiTro === tab.ma ? 'page' : undefined}
            className={`py-3 px-6 text-xs font-bold border-b-2 transition ${
              boLoc.vaiTro === tab.ma
                ? 'border-[#165137] text-[#165137]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.nhan}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="search"
          value={tuKhoaNhap}
          onChange={(e) => setTuKhoaNhap(e.target.value)}
          placeholder="Tìm theo họ tên, email hoặc số điện thoại"
          aria-label="Tìm tài khoản"
          className="flex-1 max-w-md border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#165137]"
        />
        <select
          value={boLoc.trangThai}
          onChange={(e) => doiBoLoc({ trangThai: e.target.value })}
          aria-label="Lọc theo trạng thái"
          className="border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#165137]"
        >
          {LOC_TRANG_THAI.map((muc) => (
            <option key={muc.ma} value={muc.ma}>
              {muc.nhan}
            </option>
          ))}
        </select>
        {duLieu && (
          <p className="text-xs font-semibold text-slate-500 md:ml-auto">
            Tổng <span className="text-slate-900">{duLieu.tongTheoVaiTro}</span> tài khoản {tenVaiTro} ·{' '}
            <span className={duLieu.soBiKhoaTheoVaiTro > 0 ? 'text-rose-700' : 'text-slate-900'}>
              {duLieu.soBiKhoaTheoVaiTro}
            </span>{' '}
            đang bị khóa
          </p>
        )}
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : cacTaiKhoan.length === 0 ? (
        <EmptyState noiDung={`Không có tài khoản ${tenVaiTro} nào phù hợp.`} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-x-auto p-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-5">{laChuSan ? 'Chủ sân' : 'Khách hàng'}</th>
                <th className="py-4 px-5">Email / SĐT</th>
                <th className="py-4 px-5">{laChuSan ? 'Doanh nghiệp / Cơ sở' : 'Số đơn đặt'}</th>
                {laChuSan && <th className="py-4 px-5">Hồ sơ / Vi phạm</th>}
                <th className="py-4 px-5">Trạng thái</th>
                <th className="py-4 px-5">Ngày tạo</th>
                <th className="py-4 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {cacTaiKhoan.map((tk) => {
                const biKhoa = tk.trangThai === 'locked';
                const duyet = TRANG_THAI_DUYET[tk.trangThaiDuyet];
                return (
                  <tr key={tk.maNguoiDung} className={biKhoa ? 'bg-rose-50/40' : 'hover:bg-slate-50/50'}>
                    <td className="py-4 px-5 font-bold text-slate-900">{tk.hoTen}</td>
                    <td className="py-4 px-5 text-slate-600">
                      <span className="break-all">{tk.email}</span>
                      <br />
                      <span className="text-[10px] text-slate-400">{tk.soDienThoai || 'Chưa có số điện thoại'}</span>
                    </td>
                    {laChuSan ? (
                      <td className="py-4 px-5">
                        <span className="font-semibold">{tk.tenDoanhNghiep || 'Chưa cập nhật'}</span>
                        <br />
                        <span className="text-[10px] text-slate-400">{tk.soCoSo} cơ sở</span>
                      </td>
                    ) : (
                      <td className="py-4 px-5 font-semibold">{tk.soDon} lượt đặt</td>
                    )}
                    {laChuSan && (
                      <td className="py-4 px-5">
                        <div className="flex flex-wrap gap-1.5">
                          {duyet ? <StatusBadge nhan={duyet.nhan} mau={duyet.mau} /> : <StatusBadge nhan="Chưa có hồ sơ" />}
                          {tk.soLanViPham > 0 && (
                            <StatusBadge nhan={`Vi phạm ${tk.soLanViPham}/3`} mau={tk.soLanViPham >= 2 ? 'do' : 'vang'} />
                          )}
                        </div>
                      </td>
                    )}
                    <td className="py-4 px-5 max-w-[16rem]">
                      <StatusBadge nhan={biKhoa ? 'Đã khóa' : 'Hoạt động'} mau={biKhoa ? 'do' : 'xanh'} />
                      {biKhoa && (
                        <p className="mt-1.5 text-[11px] text-rose-700 leading-snug">
                          <span className="font-bold">Lý do:</span> {tk.lyDoKhoa || 'Chưa ghi lý do'}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-5 text-slate-600">{dinhDangNgayGio(tk.ngayTao)}</td>
                    <td className="py-4 px-5 text-right">
                      {biKhoa ? (
                        <button
                          type="button"
                          onClick={() => moHopThoai('moKhoa', tk)}
                          className="px-3 py-1.5 rounded-xl font-bold border border-emerald-200 text-[#165137] bg-emerald-50 hover:bg-emerald-100 transition"
                        >
                          Mở khóa
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moHopThoai('khoa', tk)}
                          className="px-3 py-1.5 rounded-xl font-bold border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition"
                        >
                          Khóa tài khoản
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {tongTrang > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
              <span>
                Trang {boLoc.trang}/{tongTrang} · {duLieu.tong} tài khoản
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={boLoc.trang <= 1}
                  onClick={() => doiTrang(boLoc.trang - 1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-100 transition disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={boLoc.trang >= tongTrang}
                  onClick={() => doiTrang(boLoc.trang + 1)}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-100 transition disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={dangKhoa ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'}
        noiDung={
          dangKhoa ? (
            <>
              <p>
                Khóa tài khoản {tenVaiTro} <strong>{hanhDong?.taiKhoan.hoTen}</strong> ({hanhDong?.taiKhoan.email}).
              </p>
              <p>
                Khi đăng nhập, người dùng sẽ thấy: “Tài khoản của bạn bị khóa vì lý do …” kèm đúng lý do bạn nhập bên dưới.
              </p>
              {laChuSan && <p>Các cơ sở đang hoạt động của chủ sân này cũng bị khóa và ngừng hiển thị cho khách.</p>}
            </>
          ) : (
            <p>
              Tài khoản <strong>{hanhDong?.taiKhoan.hoTen}</strong> sẽ đăng nhập và sử dụng lại bình thường.
              {laChuSan && ' Các cơ sở bị khóa cùng lúc với tài khoản này sẽ được mở lại.'}
            </p>
          )
        }
        nhanXacNhan={dangKhoa ? 'Khóa tài khoản' : 'Mở khóa'}
        nguyHiem={dangKhoa}
        truongNhap={
          dangKhoa
            ? { nhan: 'Lý do khóa', toiThieu: 3, toiDa: 255, goiY: 'Ví dụ: không tuân thủ quy định của hệ thống', nhieuDong: true }
            : null
        }
        dangXuLy={dangXuLy}
        loi={loiHopThoai}
        khiXacNhan={xacNhan}
        khiHuy={() => setHanhDong(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
