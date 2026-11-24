/** Màn hình Chờ xác nhận / quá hạn (G2.6): đơn khách đã gửi ảnh chuyển khoản, đang đợi chủ sân xác nhận.
 *  Quá hạn KHÔNG tự nhả slot: Admin xem ảnh rồi tự Duyệt / Từ chối. Chỉ hiển thị dữ liệu API, không tự tính trạng thái. */
import { useEffect, useState } from 'react';
import { layDonChoXacNhan, xacNhanThanhToan, tuChoiThanhToan } from '../api/admin';
import { duongDanTep } from '../api/client';
import { dinhDangTien, dinhDangNgayGio } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const BO_LOC = [
  { ma: 'tatCa', nhan: 'Tất cả', quaHan: undefined },
  { ma: 'quaHan', nhan: 'Quá hạn', quaHan: true },
  { ma: 'conHan', nhan: 'Còn hạn', quaHan: false },
];

const KET_QUA = {
  pending: { nhan: 'Đang chờ duyệt', mau: 'vang' },
  accepted: { nhan: 'Đã chấp nhận', mau: 'xanh' },
  rejected: { nhan: 'Đã từ chối', mau: 'do' },
};
const nhanKetQua = (ma) => KET_QUA[ma] || { nhan: ma || '—', mau: 'xam' };

/** Số giây (API trả) -> chữ dễ đọc, vd 4500 -> "1 giờ 15 phút" */
function chuThoiGian(giay) {
  const tong = Math.abs(Number(giay) || 0);
  const gio = Math.floor(tong / 3600);
  const phut = Math.floor((tong % 3600) / 60);
  if (gio > 0) return `${gio} giờ ${phut} phút`;
  return `${Math.max(phut, 1)} phút`;
}

function CanhBaoTrung({ danhSach }) {
  if (!danhSach?.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-900 space-y-1" role="alert">
      <div className="font-bold">⚠ Ảnh trùng với ảnh đã gửi ở đơn khác</div>
      <ul className="list-disc pl-4">
        {danhSach.map((c, i) => (
          <li key={`${c.maChungTu ?? 'x'}-${c.maDatSan ?? 'khac'}-${i}`}>
            {c.maDon ? `Đơn ${c.maDon}` : 'Một đơn khác'} (gửi lúc {dinhDangNgayGio(c.ngayGui)})
          </li>
        ))}
      </ul>
      <div className="text-amber-800">Chỉ là cảnh báo, hệ thống không tự từ chối. Hãy đối chiếu số tiền và nội dung trên sao kê.</div>
    </div>
  );
}

/** Xem tất cả ảnh của một đơn (mới nhất trước, đúng thứ tự API) */
function ThuVienAnh({ chungTu }) {
  const [chon, setChon] = useState(0);
  if (!chungTu?.length) return <p className="text-[11px] text-slate-500">Chưa có ảnh nào.</p>;
  const anh = chungTu[Math.min(chon, chungTu.length - 1)];
  const ketQua = nhanKetQua(anh.ketQua);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="font-bold text-slate-800">
          Ảnh {chungTu.length - chon}/{chungTu.length}
        </span>
        <span>gửi {dinhDangNgayGio(anh.ngayGui)}</span>
        <span>· {anh.thoiDiemChuyen ? `giờ chuyển ghi trên biên lai: ${dinhDangNgayGio(anh.thoiDiemChuyen)}` : 'khách không nhập giờ chuyển'}</span>
        <StatusBadge nhan={ketQua.nhan} mau={ketQua.mau} />
      </div>
      {anh.ketQua === 'rejected' && anh.lyDo && (
        <p className="text-[11px] font-semibold text-rose-700">Lý do từ chối: {anh.lyDo}</p>
      )}
      <a href={duongDanTep(anh.anhUrl)} target="_blank" rel="noreferrer" title="Mở ảnh gốc ở tab mới">
        <img
          src={duongDanTep(anh.anhUrl)}
          alt={`Ảnh chuyển khoản ${chungTu.length - chon}/${chungTu.length}`}
          className="max-h-80 rounded-xl border border-slate-200 object-contain bg-slate-50"
        />
      </a>
      {chungTu.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {chungTu.map((a, i) => (
            <button
              key={a.maChungTu}
              type="button"
              onClick={() => setChon(i)}
              aria-label={`Xem ảnh ${chungTu.length - i}`}
              className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${
                i === chon ? 'border-[#165137]' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <img src={duongDanTep(a.anhUrl)} alt="" className="w-full h-full object-cover" />
              {a.canhBaoTrungAnh?.length > 0 && (
                <span className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-1 rounded-bl-md">⚠</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaymentProofs({ khiThayDoi }) {
  const [boLoc, setBoLoc] = useState('tatCa');
  const [dons, setDons] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'duyet' | 'tuChoi', don }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    const quaHan = BO_LOC.find((b) => b.ma === boLoc)?.quaHan;
    layDonChoXacNhan({ quaHan })
      .then((duLieu) => {
        if (daHuy) return;
        setDons(duLieu);
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

  const lamMoi = () => setLanTai((n) => n + 1);
  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    lamMoi();
  };
  const doiBoLoc = (ma) => {
    if (ma === boLoc) return;
    setDangTai(true);
    setLoi('');
    setBoLoc(ma);
  };
  const moHopThoai = (loai, don) => {
    setLoiHopThoai('');
    setHanhDong({ loai, don });
  };

  const xacNhan = async (lyDo) => {
    const { loai, don } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      if (loai === 'duyet') {
        await xacNhanThanhToan(don.maDatSan);
        setToast({ loai: 'thanhCong', noiDung: `Đã xác nhận thanh toán đơn ${don.maDon}` });
      } else {
        await tuChoiThanhToan(don.maDatSan, lyDo);
        setToast({ loai: 'thanhCong', noiDung: `Đã từ chối thanh toán đơn ${don.maDon}, khách được giữ chỗ để gửi lại ảnh` });
      }
      setHanhDong(null);
      lamMoi();
      khiThayDoi?.();
    } catch (e) {
      if (e.maTrangThai === 404 || e.maTrangThai === 409) {
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

  const donDangXuLy = hanhDong?.don;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Chờ xác nhận / quá hạn</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Đơn khách đã gửi ảnh chuyển khoản, đang đợi chủ sân xác nhận. Đơn quá hạn vẫn được giữ chỗ, hệ thống không tự nhả sân:
          bạn xem ảnh rồi duyệt hoặc từ chối thủ công.
        </p>
      </div>

      <div className="flex gap-2" role="group" aria-label="Bộ lọc hạn xác nhận">
        {BO_LOC.map((b) => (
          <button
            key={b.ma}
            type="button"
            onClick={() => doiBoLoc(b.ma)}
            aria-pressed={boLoc === b.ma}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
              boLoc === b.ma
                ? 'bg-[#165137] text-white border-[#165137]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {b.nhan}
          </button>
        ))}
      </div>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : dons.length === 0 ? (
        <EmptyState noiDung="Không có đơn nào đang chờ xác nhận." />
      ) : (
        <div className="space-y-4">
          {dons.map((don) => (
            <article
              key={don.maDatSan}
              className={`bg-white rounded-2xl border shadow-sm p-5 space-y-4 ${
                don.quaHan ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/30' : 'border-slate-200/90'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-[#165137] text-sm">{don.maDon}</span>
                    {don.quaHan ? (
                      <StatusBadge nhan="QUÁ HẠN" mau="do" />
                    ) : (
                      <StatusBadge nhan="Còn hạn" mau="xanhDuong" />
                    )}
                    {don.soDonCon > 1 && <StatusBadge nhan={`Nhóm ${don.soDonCon} đơn con`} mau="xam" />}
                  </div>
                  <div className="text-xs text-slate-700 font-medium">
                    {don.tenKhach} · {don.soDienThoaiLienHe}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {don.tenCoSo} · {don.tenSan} · {dinhDangNgayGio(don.ngay)} {String(don.gioBatDau || '').slice(0, 5)}–
                    {String(don.gioKetThuc || '').slice(0, 5)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Chủ sân: {don.tenChuSan} · {don.soDienThoaiChuSan}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-lg font-extrabold text-slate-900">{dinhDangTien(don.soTien)}</div>
                  <div className="text-[11px] text-slate-500">Nội dung CK: {don.noiDungChuyenKhoan || '—'}</div>
                </div>
              </div>

              <div className={`text-xs font-semibold ${don.quaHan ? 'text-rose-700' : 'text-slate-600'}`}>
                Hạn xác nhận: {dinhDangNgayGio(don.hanXacNhan)}
                {don.conLaiXacNhanGiay != null &&
                  (don.quaHan
                    ? ` — đã quá ${chuThoiGian(don.conLaiXacNhanGiay)} (đơn vẫn đang giữ chỗ)`
                    : ` — còn ${chuThoiGian(don.conLaiXacNhanGiay)}`)}
              </div>

              <CanhBaoTrung danhSach={don.canhBaoTrungAnh} />
              <ThuVienAnh chungTu={don.chungTu} />

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => moHopThoai('tuChoi', don)}
                  className="px-4 py-2 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-50 transition"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => moHopThoai('duyet', don)}
                  className="px-4 py-2 bg-[#165137] hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition"
                >
                  Duyệt đã nhận tiền
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={hanhDong?.loai === 'tuChoi' ? 'Từ chối thanh toán?' : 'Xác nhận đã nhận tiền?'}
        noiDung={
          hanhDong?.loai === 'tuChoi' ? (
            <p>
              Đơn <strong>{donDangXuLy?.maDon}</strong> quay về chờ thanh toán, khách được giữ chỗ để gửi lại ảnh. Lý do sẽ hiện cho khách
              và được ghi nhật ký.
            </p>
          ) : (
            <p>
              Xác nhận đơn <strong>{donDangXuLy?.maDon}</strong> đã nhận <strong>{dinhDangTien(donDangXuLy?.soTien)}</strong>. Đơn chuyển sang
              Đã xác nhận và được ghi nhật ký.
            </p>
          )
        }
        nhanXacNhan={hanhDong?.loai === 'tuChoi' ? 'Từ chối' : 'Duyệt'}
        nguyHiem={hanhDong?.loai === 'tuChoi'}
        truongNhap={
          hanhDong?.loai === 'tuChoi'
            ? { nhan: 'Lý do từ chối', toiThieu: 2, toiDa: 255, goiY: 'Ví dụ: ảnh mờ, sai số tiền, chưa thấy tiền về', nhieuDong: true }
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
