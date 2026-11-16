/** Màn hình Hoàn tiền */
import { useEffect, useState } from 'react';
import { layHangDoiHoanTien, xuLyHoanTien, hoanTatHoanTien } from '../api/admin';
import { dinhDangTien, dinhDangNgayGio, nhanTrangThaiHoanTien, nhanTrangThaiThanhToan } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const coDuThongTin = (dong) =>
  Boolean(dong.tenNganHang && dong.maNganHang && dong.soTaiKhoan && dong.chuTaiKhoan) && Number(dong.soTienHoan) > 0;

export default function Refunds({ khiThayDoi }) {
  const [dongs, setDongs] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'yeuCau' | 'duyet' | 'hoanTat', dong }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layHangDoiHoanTien()
      .then((duLieu) => {
        if (daHuy) return;
        setDongs(duLieu);
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

  const lamMoi = () => setLanTai((n) => n + 1);
  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    lamMoi();
  };

  const moHopThoai = (loai, dong) => {
    setLoiHopThoai('');
    setHanhDong({ loai, dong });
  };

  const saoChep = async (chu, nhan) => {
    try {
      await navigator.clipboard.writeText(String(chu));
      setToast({ loai: 'thanhCong', noiDung: `Đã sao chép ${nhan}` });
    } catch {
      setToast({ loai: 'loi', noiDung: 'Không sao chép được, hãy chọn và sao chép thủ công' });
    }
  };

  const xacNhan = async (maGiaoDichHoan) => {
    const { loai, dong } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      if (loai === 'hoanTat') {
        await hoanTatHoanTien(dong.maThanhToan, maGiaoDichHoan);
        setToast({ loai: 'thanhCong', noiDung: `Đã ghi nhận hoàn tiền cho đơn ${dong.maDon}` });
      } else {
        await xuLyHoanTien(dong.maThanhToan);
        setToast({
          loai: 'thanhCong',
          noiDung:
            loai === 'yeuCau'
              ? `Đã yêu cầu khách đơn ${dong.maDon} cung cấp tài khoản nhận hoàn`
              : `Đã duyệt hoàn tiền cho đơn ${dong.maDon}`,
        });
      }
      setHanhDong(null);
      lamMoi();
      khiThayDoi?.();
    } catch (e) {
      if (e.maTrangThai === 409) {
        setHanhDong(null);
        setToast({ loai: 'loi', noiDung: `${e.message}. Danh sách đã được tải lại.` });
        lamMoi();
        khiThayDoi?.();
      } else {
        setLoiHopThoai(e.message);
      }
    } finally {
      setDangXuLy(false);
    }
  };

  const dongDangXuLy = hanhDong?.dong;
  const tieuDeHopThoai = {
    yeuCau: 'Yêu cầu khách cung cấp tài khoản?',
    duyet: 'Duyệt hoàn tiền?',
    hoanTat: 'Xác nhận đã chuyển khoản hoàn?',
  }[hanhDong?.loai];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Hoàn tiền</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Khoản khách chuyển trễ cần hoàn lại. Bạn chuyển khoản thủ công bằng ngân hàng, rồi nhập mã giao dịch để ghi nhận.
        </p>
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : dongs.length === 0 ? (
        <EmptyState noiDung="Không có khoản nào đang chờ hoàn tiền." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-5">Mã đơn</th>
                <th className="py-4 px-5">Khách</th>
                <th className="py-4 px-5">Số tiền</th>
                <th className="py-4 px-5">Trạng thái</th>
                <th className="py-4 px-5">Tài khoản nhận hoàn</th>
                <th className="py-4 px-5">Cập nhật</th>
                <th className="py-4 px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {dongs.map((dong) => {
                const hoanTien = nhanTrangThaiHoanTien(dong.trangThaiHoanTien);
                const thanhToan = nhanTrangThaiThanhToan(dong.trangThai);
                return (
                  <tr key={dong.maThanhToan} className="hover:bg-slate-50/50 align-top">
                    <td className="py-4 px-5 font-bold text-[#165137] whitespace-nowrap">{dong.maDon}</td>
                    <td className="py-4 px-5">
                      <div className="font-bold text-slate-900">{dong.tenKhach}</div>
                      <div className="text-[11px] text-slate-500">{dong.soDienThoai}</div>
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{dinhDangTien(dong.soTien)}</div>
                      <div className="text-[11px] text-slate-500">Hoàn: {dinhDangTien(dong.soTienHoan)}</div>
                    </td>
                    <td className="py-4 px-5 space-y-1.5">
                      <div>
                        <StatusBadge nhan={hoanTien.nhan} mau={hoanTien.mau} />
                      </div>
                      <div>
                        <StatusBadge nhan={thanhToan.nhan} mau={thanhToan.mau} />
                      </div>
                      {dong.lyDo && <div className="text-[11px] text-slate-500">{dong.lyDo}</div>}
                    </td>
                    <td className="py-4 px-5">
                      {dong.soTaiKhoan ? (
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900">{dong.chuTaiKhoan}</div>
                          <div className="text-[11px] text-slate-600">
                            {dong.tenNganHang} ({dong.maNganHang})
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-slate-800">{dong.soTaiKhoan}</span>
                            <button
                              type="button"
                              onClick={() => saoChep(dong.soTaiKhoan, 'số tài khoản')}
                              className="px-2 py-0.5 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                            >
                              Sao chép
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Chưa có</span>
                      )}
                    </td>
                    <td className="py-4 px-5 whitespace-nowrap text-slate-600">{dinhDangNgayGio(dong.ngayCapNhat)}</td>
                    <td className="py-4 px-5 text-right">
                      {dong.trangThaiHoanTien === 'none' && (
                        <button
                          type="button"
                          onClick={() => moHopThoai('yeuCau', dong)}
                          className="px-3 py-1.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold rounded-xl transition"
                        >
                          Yêu cầu khách cung cấp tài khoản
                        </button>
                      )}
                      {dong.trangThaiHoanTien === 'waiting_info' &&
                        (coDuThongTin(dong) ? (
                          <button
                            type="button"
                            onClick={() => moHopThoai('duyet', dong)}
                            className="px-3 py-1.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold rounded-xl transition"
                          >
                            Duyệt hoàn tiền
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-3 py-1.5 bg-slate-100 text-slate-400 font-bold rounded-xl cursor-not-allowed"
                          >
                            Chờ khách cung cấp tài khoản
                          </button>
                        ))}
                      {dong.trangThaiHoanTien === 'processing' && (
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => saoChep(Number(dong.soTienHoan), 'số tiền')}
                            className="px-3 py-1 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            Sao chép số tiền
                          </button>
                          <button
                            type="button"
                            onClick={() => moHopThoai('hoanTat', dong)}
                            className="px-3 py-1.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold rounded-xl transition"
                          >
                            Xác nhận đã chuyển khoản
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={tieuDeHopThoai}
        noiDung={
          hanhDong?.loai === 'hoanTat' ? (
            <>
              <p>
                Chuyển <strong>{dinhDangTien(dongDangXuLy?.soTienHoan)}</strong> tới {dongDangXuLy?.chuTaiKhoan} –{' '}
                {dongDangXuLy?.tenNganHang}, số tài khoản <strong>{dongDangXuLy?.soTaiKhoan}</strong>.
              </p>
              <p>Chỉ xác nhận sau khi đã chuyển khoản xong, rồi nhập mã giao dịch của ngân hàng.</p>
            </>
          ) : hanhDong?.loai === 'duyet' ? (
            <p>
              Đơn <strong>{dongDangXuLy?.maDon}</strong> sẽ chuyển sang bước chờ bạn chuyển khoản hoàn{' '}
              {dinhDangTien(dongDangXuLy?.soTienHoan)}.
            </p>
          ) : (
            <p>
              Khách của đơn <strong>{dongDangXuLy?.maDon}</strong> sẽ được yêu cầu nhập tài khoản nhận hoàn{' '}
              {dinhDangTien(dongDangXuLy?.soTien)} trong ứng dụng.
            </p>
          )
        }
        nhanXacNhan={hanhDong?.loai === 'hoanTat' ? 'Đã chuyển khoản' : 'Xác nhận'}
        truongNhap={
          hanhDong?.loai === 'hoanTat'
            ? { nhan: 'Mã giao dịch hoàn', toiThieu: 3, toiDa: 100, goiY: 'Mã giao dịch từ ngân hàng' }
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
