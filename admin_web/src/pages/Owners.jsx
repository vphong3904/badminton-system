/** Màn hình Duyệt hồ sơ chủ sân */
import { useEffect, useState } from 'react';
import { layHoSoChoDuyet, duyetHoSoChuSan } from '../api/admin';
import { dinhDangNgayGio, anSoTaiKhoan } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';

const hienTruong = (giaTri) => giaTri || 'Chưa cập nhật';

/** API trả mỗi (chủ sân, cơ sở) một dòng → gộp lại thành 1 hồ sơ cho mỗi chủ sân (duyệt theo chủ sân) */
function gopTheoChuSan(danhSach) {
  const theoChuSan = new Map();
  danhSach.forEach((dong) => {
    if (!theoChuSan.has(dong.maNguoiDung)) {
      theoChuSan.set(dong.maNguoiDung, { ...dong, tenCoSos: [], diaChis: [], khuVucs: [] });
    }
    const hoSo = theoChuSan.get(dong.maNguoiDung);
    const them = (mang, giaTri) => giaTri && !mang.includes(giaTri) && mang.push(giaTri);
    them(hoSo.tenCoSos, dong.tenCoSo);
    them(hoSo.diaChis, dong.diaChi);
    them(hoSo.khuVucs, [dong.quanHuyen, dong.tinhThanh].filter(Boolean).join(', '));
  });
  return [...theoChuSan.values()];
}

export default function Owners({ khiThayDoi }) {
  const [hoSos, setHoSos] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'duyet' | 'tuChoi', hoSo }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layHoSoChoDuyet()
      .then((duLieu) => {
        if (daHuy) return;
        setHoSos(gopTheoChuSan(duLieu));
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

  const moHopThoai = (loai, hoSo) => {
    setLoiHopThoai('');
    setHanhDong({ loai, hoSo });
  };

  const xacNhan = async (lyDo) => {
    const { loai, hoSo } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      await duyetHoSoChuSan(
        hoSo.maNguoiDung,
        loai === 'duyet' ? { trangThai: 'approved' } : { trangThai: 'rejected', lyDoTuChoi: lyDo },
      );
      setToast({
        loai: 'thanhCong',
        noiDung: loai === 'duyet' ? `Đã duyệt hồ sơ của ${hoSo.hoTen}` : `Đã từ chối hồ sơ của ${hoSo.hoTen}`,
      });
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Duyệt hồ sơ chủ sân</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Hồ sơ do chủ sân gửi từ ứng dụng. Duyệt xong, chủ sân mới quản lý được sân của mình.
        </p>
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : hoSos.length === 0 ? (
        <EmptyState noiDung="Không có hồ sơ nào đang chờ duyệt." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {hoSos.map((hoSo) => (
            <div key={hoSo.maNguoiDung} className="bg-white p-6 rounded-2xl border border-amber-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Chủ sân</p>
                  <h3 className="font-extrabold text-slate-900 text-lg">{hoSo.hoTen}</h3>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] rounded-full border border-amber-300 shrink-0">
                  Chờ duyệt
                </span>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <dt className="font-bold text-slate-600">Email</dt>
                <dd className="text-slate-800 break-all">{hoSo.email}</dd>
                <dt className="font-bold text-slate-600">Số điện thoại</dt>
                <dd className="text-slate-800">{hoSo.soDienThoai}</dd>
                <dt className="font-bold text-slate-600">Doanh nghiệp</dt>
                <dd className="text-slate-800">{hienTruong(hoSo.tenDoanhNghiep)}</dd>
                <dt className="font-bold text-slate-600">Địa chỉ</dt>
                <dd className="text-slate-800">{hoSo.diaChis.length ? hoSo.diaChis.join('; ') : 'Chưa cập nhật'}</dd>
                <dt className="font-bold text-slate-600">Khu vực</dt>
                <dd className="text-slate-800">{hoSo.khuVucs.length ? hoSo.khuVucs.join('; ') : 'Chưa cập nhật'}</dd>
                <dt className="font-bold text-slate-600">Số tài khoản</dt>
                <dd className="text-slate-800 font-mono tracking-wide">{anSoTaiKhoan(hoSo.soTaiKhoan)}</dd>
                <dt className="font-bold text-slate-600">Ngày gửi duyệt</dt>
                <dd className="text-slate-800">{dinhDangNgayGio(hoSo.ngayGuiDuyet)}</dd>
              </dl>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => moHopThoai('duyet', hoSo)}
                  className="flex-1 py-2.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
                >
                  Phê duyệt
                </button>
                <button
                  type="button"
                  onClick={() => moHopThoai('tuChoi', hoSo)}
                  className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-100 transition"
                >
                  Từ chối
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={hanhDong?.loai === 'duyet' ? 'Phê duyệt hồ sơ?' : 'Từ chối hồ sơ?'}
        noiDung={
          hanhDong?.loai === 'duyet' ? (
            <p>
              Chủ sân <strong>{hanhDong?.hoSo.hoTen}</strong> sẽ được dùng các chức năng quản lý và cơ sở sân sẽ hiển thị cho khách.
            </p>
          ) : (
            <p>
              Chủ sân <strong>{hanhDong?.hoSo.hoTen}</strong> sẽ thấy lý do từ chối và có thể sửa hồ sơ rồi gửi lại.
            </p>
          )
        }
        nhanXacNhan={hanhDong?.loai === 'duyet' ? 'Phê duyệt' : 'Từ chối hồ sơ'}
        nguyHiem={hanhDong?.loai === 'tuChoi'}
        truongNhap={
          hanhDong?.loai === 'tuChoi'
            ? { nhan: 'Lý do từ chối', toiThieu: 3, toiDa: 255, goiY: 'Ví dụ: Thiếu thông tin ngân hàng', nhieuDong: true }
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
