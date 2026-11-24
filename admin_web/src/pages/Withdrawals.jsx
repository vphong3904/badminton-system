/** Màn hình Rút tiền: admin chuyển khoản cho chủ sân rồi ghi nhận mã giao dịch */
import { useEffect, useMemo, useState } from 'react';
import { layHangDoiRutTien, xacNhanDaChi, tuChoiRutTien } from '../api/admin';
import { dinhDangTien, dinhDangNgayGio, soNgayCho, nhanThoiGianCho } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';

/** Bỏ dấu tiếng Việt và hạ chữ thường để tìm kiếm không phân biệt dấu */
const boDau = (chu) =>
  String(chu ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const CACH_SAP_XEP = {
  choLau: { nhan: 'Chờ lâu nhất trước', so: (a, b) => String(a.ngayYeuCau).localeCompare(String(b.ngayYeuCau)) },
  tienCao: { nhan: 'Số tiền cao nhất trước', so: (a, b) => Number(b.soTien) - Number(a.soTien) },
  tienThap: { nhan: 'Số tiền thấp nhất trước', so: (a, b) => Number(a.soTien) - Number(b.soTien) },
  ten: { nhan: 'Tên chủ sân A đến Z', so: (a, b) => String(a.tenChuSan).localeCompare(String(b.tenChuSan), 'vi') },
};

function NutSaoChep({ khiBam }) {
  return (
    <button
      type="button"
      onClick={khiBam}
      className="px-2 py-0.5 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100"
    >
      Sao chép
    </button>
  );
}

function TheSoLieu({ tieuDe, giaTri, phu }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-1">
      <span className="text-xs font-semibold text-slate-500">{tieuDe}</span>
      <h2 className="text-2xl font-extrabold text-slate-900">{giaTri}</h2>
      {phu && <p className="text-[11px] text-slate-500 font-medium truncate">{phu}</p>}
    </div>
  );
}

export default function Withdrawals({ khiThayDoi }) {
  const [yeuCaus, setYeuCaus] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [timKiem, setTimKiem] = useState('');
  const [kieuSapXep, setKieuSapXep] = useState('choLau');
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'chi' | 'tuChoi', yeuCau }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layHangDoiRutTien()
      .then((duLieu) => {
        if (daHuy) return;
        setYeuCaus(duLieu);
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

  // Bốn thẻ số liệu: tính từ cùng mảng dữ liệu, không gọi thêm API
  const soLieu = useMemo(() => {
    const tong = yeuCaus.reduce((t, yc) => t + (Number(yc.soTien) || 0), 0);
    const soChuSan = new Set(yeuCaus.map((yc) => yc.maChuSan)).size;
    const choLauNhat = yeuCaus.reduce(
      (tot, yc) => (!tot || String(yc.ngayYeuCau) < String(tot.ngayYeuCau) ? yc : tot),
      null,
    );
    return { tong, soChuSan, choLauNhat };
  }, [yeuCaus]);

  // Tìm kiếm và sắp xếp ở trình duyệt, không đổi mảng gốc
  const hienThi = useMemo(() => {
    const tuKhoa = boDau(timKiem.trim());
    const daLoc = tuKhoa
      ? yeuCaus.filter((yc) =>
          [yc.tenChuSan, yc.soDienThoai, yc.soTaiKhoan, yc.maYeuCau].some((g) => boDau(g).includes(tuKhoa)),
        )
      : yeuCaus;
    return [...daLoc].sort(CACH_SAP_XEP[kieuSapXep].so);
  }, [yeuCaus, timKiem, kieuSapXep]);

  const saoChep = async (chu, nhan) => {
    try {
      await navigator.clipboard.writeText(String(chu));
      setToast({ loai: 'thanhCong', noiDung: `Đã sao chép ${nhan}` });
    } catch {
      setToast({ loai: 'loi', noiDung: 'Không sao chép được, hãy chọn và sao chép thủ công' });
    }
  };

  const moHopThoai = (loai, yeuCau) => {
    setLoiHopThoai('');
    setHanhDong({ loai, yeuCau });
  };

  const xacNhan = async (giaTriNhap) => {
    const { loai, yeuCau } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      if (loai === 'chi') {
        await xacNhanDaChi(yeuCau.maYeuCau, giaTriNhap);
        setToast({
          loai: 'thanhCong',
          noiDung: `Đã ghi nhận chi tiền cho ${yeuCau.tenChuSan}. Có thể xem lại ở Nhật ký hệ thống.`,
        });
      } else {
        await tuChoiRutTien(yeuCau.maYeuCau, giaTriNhap);
        setToast({ loai: 'thanhCong', noiDung: `Đã từ chối yêu cầu rút tiền của ${yeuCau.tenChuSan}` });
      }
      setHanhDong(null);
      lamMoi();
      khiThayDoi?.();
    } catch (e) {
      if (e.maTrangThai === 409) {
        setHanhDong(null);
        setToast({ loai: 'loi', noiDung: 'Yêu cầu không còn chờ xử lý. Danh sách đã được tải lại.' });
        lamMoi();
        khiThayDoi?.();
      } else {
        setLoiHopThoai(e.message);
      }
    } finally {
      setDangXuLy(false);
    }
  };

  const yeuCauDangXuLy = hanhDong?.yeuCau;
  const choLauNhat = soLieu.choLauNhat;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Rút tiền</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Chuyển khoản cho chủ sân bằng ngân hàng, rồi nhập mã giao dịch để ghi nhận đã chi.
        </p>
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            <TheSoLieu tieuDe="Yêu cầu đang chờ" giaTri={yeuCaus.length} />
            <TheSoLieu tieuDe="Tổng tiền cần chi" giaTri={dinhDangTien(soLieu.tong)} />
            <TheSoLieu tieuDe="Chủ sân đang chờ" giaTri={soLieu.soChuSan} />
            <TheSoLieu
              tieuDe="Chờ lâu nhất"
              giaTri={choLauNhat ? nhanThoiGianCho(soNgayCho(choLauNhat.ngayYeuCau)) : '—'}
              phu={choLauNhat ? choLauNhat.tenChuSan : null}
            />
          </div>

          {yeuCaus.length === 0 ? (
            <EmptyState noiDung="Không có yêu cầu rút tiền nào đang chờ." />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm text-xs">
                <div className="space-y-1 flex-1 min-w-[240px]">
                  <label htmlFor="tim-kiem-rut-tien" className="block font-bold text-slate-600">
                    Tìm kiếm
                  </label>
                  <input
                    id="tim-kiem-rut-tien"
                    type="search"
                    value={timKiem}
                    onChange={(e) => setTimKiem(e.target.value)}
                    placeholder="Tên chủ sân, số điện thoại, số tài khoản, mã yêu cầu"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#165137]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sap-xep-rut-tien" className="block font-bold text-slate-600">
                    Sắp xếp
                  </label>
                  <select
                    id="sap-xep-rut-tien"
                    value={kieuSapXep}
                    onChange={(e) => setKieuSapXep(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#165137]"
                  >
                    {Object.entries(CACH_SAP_XEP).map(([khoa, cach]) => (
                      <option key={khoa} value={khoa}>
                        {cach.nhan}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={thuLai}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition"
                >
                  Làm mới
                </button>
                <p className="basis-full text-slate-500 font-semibold">
                  Hiển thị {hienThi.length} trên {yeuCaus.length} yêu cầu
                </p>
              </div>

              {hienThi.length === 0 ? (
                <EmptyState noiDung="Không có yêu cầu nào khớp với tìm kiếm." />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
                      <tr>
                        <th className="py-4 px-5">Mã yêu cầu</th>
                        <th className="py-4 px-5">Chủ sân</th>
                        <th className="py-4 px-5">Số tiền</th>
                        <th className="py-4 px-5">Tài khoản nhận</th>
                        <th className="py-4 px-5">Đã chờ</th>
                        <th className="py-4 px-5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {hienThi.map((yeuCau) => (
                        <tr key={yeuCau.maYeuCau} className="hover:bg-slate-50/50 align-top">
                          <td className="py-4 px-5 font-bold text-[#165137]">#{yeuCau.maYeuCau}</td>
                          <td className="py-4 px-5">
                            <div className="font-bold text-slate-900">{yeuCau.tenChuSan}</div>
                            <div className="text-[11px] text-slate-500">{yeuCau.soDienThoai}</div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap space-y-1">
                            <div className="font-extrabold text-slate-900">{dinhDangTien(yeuCau.soTien)}</div>
                            <NutSaoChep khiBam={() => saoChep(Number(yeuCau.soTien), 'số tiền')} />
                          </td>
                          <td className="py-4 px-5 space-y-1">
                            <div className="font-bold text-slate-900">{yeuCau.chuTaiKhoan}</div>
                            <div className="text-[11px] text-slate-600">
                              {yeuCau.tenNganHang} ({yeuCau.maNganHang})
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-slate-800">{yeuCau.soTaiKhoan}</span>
                              <NutSaoChep khiBam={() => saoChep(yeuCau.soTaiKhoan, 'số tài khoản')} />
                            </div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{nhanThoiGianCho(soNgayCho(yeuCau.ngayYeuCau))}</div>
                            <div className="text-[11px] text-slate-500">{dinhDangNgayGio(yeuCau.ngayYeuCau)}</div>
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => moHopThoai('chi', yeuCau)}
                                className="px-3 py-1.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold rounded-xl transition"
                              >
                                Chi tiền
                              </button>
                              <button
                                type="button"
                                onClick={() => moHopThoai('tuChoi', yeuCau)}
                                className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-100 transition"
                              >
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={hanhDong?.loai === 'chi' ? `Chi tiền cho ${yeuCauDangXuLy?.tenChuSan}` : 'Từ chối yêu cầu rút tiền?'}
        noiDung={
          hanhDong?.loai === 'chi' ? (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-500">Số tiền</span>
                  <span className="flex items-center gap-2">
                    <strong className="text-lg text-slate-900">{dinhDangTien(yeuCauDangXuLy?.soTien)}</strong>
                    <NutSaoChep khiBam={() => saoChep(Number(yeuCauDangXuLy?.soTien), 'số tiền')} />
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-500">Ngân hàng</span>
                  <strong className="text-slate-900">
                    {yeuCauDangXuLy?.tenNganHang} ({yeuCauDangXuLy?.maNganHang})
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-500">Chủ tài khoản</span>
                  <strong className="text-slate-900">{yeuCauDangXuLy?.chuTaiKhoan}</strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-500">Số tài khoản</span>
                  <span className="flex items-center gap-2">
                    <strong className="font-mono text-slate-900">{yeuCauDangXuLy?.soTaiKhoan}</strong>
                    <NutSaoChep khiBam={() => saoChep(yeuCauDangXuLy?.soTaiKhoan, 'số tài khoản')} />
                  </span>
                </div>
              </div>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Mở ứng dụng ngân hàng và chuyển đúng số tiền tới tài khoản trên.</li>
                <li>Đợi ngân hàng báo giao dịch thành công.</li>
                <li>Nhập mã giao dịch của ngân hàng vào ô bên dưới.</li>
              </ol>
            </div>
          ) : (
            <p>
              Các đơn trong yêu cầu của <strong>{yeuCauDangXuLy?.tenChuSan}</strong> sẽ được trả lại để chủ sân rút lại sau.
            </p>
          )
        }
        nhanXacNhan={hanhDong?.loai === 'chi' ? 'Đã chi tiền' : 'Từ chối yêu cầu'}
        nguyHiem={hanhDong?.loai === 'tuChoi'}
        oXacNhan={
          hanhDong?.loai === 'chi'
            ? { nhan: `Tôi đã chuyển đúng số tiền ${dinhDangTien(yeuCauDangXuLy?.soTien)} tới đúng tài khoản ở trên.` }
            : null
        }
        truongNhap={
          hanhDong?.loai === 'chi'
            ? { nhan: 'Mã giao dịch', toiThieu: 3, toiDa: 100, goiY: 'Mã giao dịch từ ngân hàng' }
            : { nhan: 'Lý do từ chối', toiThieu: 3, toiDa: 255, goiY: 'Ví dụ: Sai số tài khoản', nhieuDong: true }
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
