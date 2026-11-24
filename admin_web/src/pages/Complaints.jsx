/**
 * Màn hình Khiếu nại của Khách hàng (khiếu nại chủ sân), chia 2 loại theo lúc khách bấm khiếu nại:
 *  - Hoàn tiền: đơn đã hủy (giaiDoan = at_cancel | after_cancel) – khách chưa được hoàn tiền / hoàn không đúng
 *  - Thanh toán thành công: đơn đã thanh toán (giaiDoan = after_payment) – chủ sân không xác nhận / không phản hồi
 */
import { useEffect, useState } from 'react';
import { layKhieuNai, xuLyKhieuNai } from '../api/admin';
import {
  dinhDangNgayGio,
  dinhDangTien,
  nhanGiaiDoanKhieuNai,
  nhanMucXuLyKhieuNai,
  nhanTrangThaiDon,
  nhanTrangThaiHoanTien,
  nhanTrangThaiKhieuNai,
} from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const SO_LAN_KHOA = 3;
const TAB_LOAI = [
  { ma: 'hoanTien', nhan: 'Hoàn tiền', moTa: 'Khách khiếu nại ở đơn đã hủy: chưa được hoàn tiền hoặc hoàn không đúng.' },
  { ma: 'thanhToan', nhan: 'Thanh toán thành công', moTa: 'Khách đã thanh toán nhưng chủ sân không xác nhận hoặc không phản hồi.' },
];
const LOC_TRANG_THAI = [
  { ma: 'pending', nhan: 'Chờ xử lý' },
  { ma: 'upheld', nhan: 'Đã chấp nhận' },
  { ma: 'rejected', nhan: 'Đã bác bỏ' },
  { ma: 'all', nhan: 'Tất cả' },
];

const thuocLoai = (khieuNai, loai) =>
  loai === 'thanhToan' ? khieuNai.giaiDoan === 'after_payment' : khieuNai.giaiDoan !== 'after_payment';

/** Mô tả hệ quả với chủ sân nếu chấp nhận khiếu nại này */
function hauQuaChapNhan(soLanViPham) {
  const lanMoi = soLanViPham + 1;
  if (lanMoi >= SO_LAN_KHOA) {
    return `Đây là lần vi phạm thứ ${SO_LAN_KHOA}: tài khoản chủ sân sẽ bị khóa và các cơ sở đang hoạt động bị ẩn.`;
  }
  if (lanMoi === 2) return 'Đây là lần vi phạm thứ 2: chủ sân nhận cảnh cáo nghiêm trọng (thêm 1 lần nữa sẽ bị khóa).';
  return 'Đây là lần vi phạm thứ 1: chủ sân nhận cảnh cáo.';
}

function Dong({ nhan, children }) {
  return (
    <>
      <dt className="font-bold text-slate-600">{nhan}</dt>
      <dd className="text-slate-800 break-words">{children}</dd>
    </>
  );
}

export default function Complaints({ khiThayDoi }) {
  const [loai, setLoai] = useState('hoanTien');
  const [trangThai, setTrangThai] = useState('pending');
  const [cacKhieuNai, setCacKhieuNai] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);
  const [hanhDong, setHanhDong] = useState(null); // { loai: 'chapNhan' | 'bacBo', khieuNai }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layKhieuNai({ trangThai, gioiHan: 100 })
      .then((duLieu) => {
        if (daHuy) return;
        setCacKhieuNai(duLieu);
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
  }, [trangThai, lanTai]);

  const lamMoi = () => setLanTai((n) => n + 1);
  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    lamMoi();
  };
  const doiTrangThai = (ma) => {
    if (ma === trangThai) return;
    setDangTai(true);
    setLoi('');
    setTrangThai(ma);
  };

  const moHopThoai = (kieu, khieuNai) => {
    setLoiHopThoai('');
    setHanhDong({ loai: kieu, khieuNai });
  };

  const xacNhan = async (ghiChu) => {
    const { loai: kieu, khieuNai } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      const ketQua = await xuLyKhieuNai(khieuNai.maKhieuNai, {
        quyetDinh: kieu === 'chapNhan' ? 'upheld' : 'rejected',
        ghiChu,
      });
      setToast({
        loai: 'thanhCong',
        noiDung:
          kieu === 'bacBo'
            ? `Đã bác bỏ khiếu nại đơn ${khieuNai.maDon}`
            : ketQua.daKhoaChuSan
              ? `Đã chấp nhận khiếu nại đơn ${khieuNai.maDon}. Tài khoản chủ sân ${khieuNai.tenChuSan} đã bị khóa.`
              : `Đã chấp nhận khiếu nại đơn ${khieuNai.maDon} (chủ sân vi phạm ${ketQua.soLanViPham}/${SO_LAN_KHOA}).`,
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

  const danhSach = cacKhieuNai.filter((muc) => thuocLoai(muc, loai));
  const tabHienTai = TAB_LOAI.find((tab) => tab.ma === loai);
  const chapNhan = hanhDong?.loai === 'chapNhan';

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Khiếu nại của Khách hàng</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Khách khiếu nại chủ sân từ ứng dụng. Chấp nhận khiếu nại là cộng 1 lần vi phạm cho chủ sân: lần 1 cảnh cáo, lần 2
          cảnh cáo nghiêm trọng, lần 3 khóa tài khoản.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b border-slate-200">
        <div className="flex">
          {TAB_LOAI.map((tab) => {
            const so = cacKhieuNai.filter((muc) => thuocLoai(muc, tab.ma)).length;
            const dangChon = loai === tab.ma;
            return (
              <button
                key={tab.ma}
                type="button"
                onClick={() => setLoai(tab.ma)}
                aria-current={dangChon ? 'page' : undefined}
                className={`py-3 px-6 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
                  dangChon ? 'border-[#165137] text-[#165137]' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab.nhan}</span>
                {!dangTai && !loi && (
                  <span
                    className={`px-2 py-0.5 font-bold text-[10px] rounded-full ${
                      trangThai === 'pending' && so > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {so}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <select
          value={trangThai}
          onChange={(e) => doiTrangThai(e.target.value)}
          aria-label="Lọc theo trạng thái khiếu nại"
          className="mb-2 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#165137]"
        >
          {LOC_TRANG_THAI.map((muc) => (
            <option key={muc.ma} value={muc.ma}>
              {muc.nhan}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs font-medium text-slate-500 -mt-3">{tabHienTai.moTa}</p>

      {dangTai ? (
        <LoadingBlock />
      ) : loi ? (
        <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
      ) : danhSach.length === 0 ? (
        <EmptyState
          noiDung={
            trangThai === 'pending'
              ? `Không có khiếu nại ${tabHienTai.nhan.toLowerCase()} nào đang chờ xử lý.`
              : `Không có khiếu nại ${tabHienTai.nhan.toLowerCase()} nào ở mục này.`
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {danhSach.map((kn) => {
            const trangThaiKn = nhanTrangThaiKhieuNai(kn.trangThai);
            const trangThaiDon = nhanTrangThaiDon(kn.trangThaiDon);
            const hoanTien = nhanTrangThaiHoanTien(kn.trangThaiHoanTien);
            const choXuLy = kn.trangThai === 'pending';
            return (
              <article
                key={kn.maKhieuNai}
                className={`bg-white p-6 rounded-2xl border shadow-sm space-y-4 ${
                  choXuLy ? 'border-amber-200' : 'border-slate-200/90'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-lg">Đơn {kn.maDon}</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {kn.tenCoSo} · gửi lúc {dinhDangNgayGio(kn.ngayTao)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge nhan={trangThaiKn.nhan} mau={trangThaiKn.mau} />
                    <span className="text-[10px] font-semibold text-slate-500">{nhanGiaiDoanKhieuNai(kn.giaiDoan)}</span>
                  </div>
                </div>

                <div className="text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                  <p className="font-bold text-slate-600 mb-1.5">Nội dung khiếu nại</p>
                  <p className="text-slate-800 leading-relaxed whitespace-pre-line break-words">{kn.noiDung}</p>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                  <Dong nhan="Khách hàng">
                    {kn.tenKhach}
                    {kn.soDienThoaiKhach ? ` · ${kn.soDienThoaiKhach}` : ''}
                  </Dong>
                  <Dong nhan="Chủ sân">
                    <span className="font-semibold">{kn.tenChuSan}</span> · <span className="break-all">{kn.emailChuSan}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <StatusBadge
                        nhan={`Vi phạm ${kn.soLanViPham}/${SO_LAN_KHOA}`}
                        mau={kn.soLanViPham >= 2 ? 'do' : kn.soLanViPham === 1 ? 'vang' : 'xam'}
                      />
                      {kn.trangThaiChuSan === 'locked' && <StatusBadge nhan="Tài khoản đã khóa" mau="do" />}
                    </div>
                  </Dong>
                  <Dong nhan="Lịch chơi">
                    {dinhDangNgayGio(kn.ngay)} · {String(kn.gioBatDau).slice(0, 5)}–{String(kn.gioKetThuc).slice(0, 5)}
                  </Dong>
                  <Dong nhan="Tổng tiền">{dinhDangTien(kn.tongTien)}</Dong>
                  <Dong nhan="Trạng thái đơn">
                    <StatusBadge nhan={trangThaiDon.nhan} mau={trangThaiDon.mau} />
                  </Dong>
                  {kn.giaiDoan !== 'after_payment' && (
                    <Dong nhan="Hoàn tiền">
                      <StatusBadge nhan={hoanTien.nhan} mau={hoanTien.mau} />
                      {Number(kn.soTienHoan) > 0 && <span className="ml-2 font-semibold">{dinhDangTien(kn.soTienHoan)}</span>}
                    </Dong>
                  )}
                </dl>

                {choXuLy ? (
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => moHopThoai('chapNhan', kn)}
                      className="flex-1 py-2.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
                    >
                      Chấp nhận khiếu nại
                    </button>
                    <button
                      type="button"
                      onClick={() => moHopThoai('bacBo', kn)}
                      className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-100 transition"
                    >
                      Bác bỏ
                    </button>
                  </div>
                ) : (
                  <div className="text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                    <p className="font-bold text-slate-700">
                      Kết quả:{' '}
                      <span className="font-semibold text-slate-800">{nhanMucXuLyKhieuNai(kn.mucXuLy)}</span>
                    </p>
                    {kn.ghiChuQuanTri && (
                      <p className="text-slate-700">
                        <span className="font-bold">Ghi chú:</span> {kn.ghiChuQuanTri}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">Xử lý lúc {dinhDangNgayGio(kn.ngayXuLy)}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={chapNhan ? 'Chấp nhận khiếu nại?' : 'Bác bỏ khiếu nại?'}
        noiDung={
          chapNhan ? (
            <>
              <p>
                Xác nhận khiếu nại của <strong>{hanhDong?.khieuNai.tenKhach}</strong> về đơn{' '}
                <strong>{hanhDong?.khieuNai.maDon}</strong> là đúng.
              </p>
              <p>{hauQuaChapNhan(hanhDong?.khieuNai.soLanViPham ?? 0)}</p>
              <p>Khách sẽ nhận thông báo kết quả. Ghi chú bên dưới không bắt buộc (nếu nhập, tối thiểu 3 ký tự).</p>
            </>
          ) : (
            <p>
              Khiếu nại của <strong>{hanhDong?.khieuNai.tenKhach}</strong> sẽ bị bác bỏ, chủ sân không bị tính vi phạm. Khách
              sẽ thấy lý do bạn nhập.
            </p>
          )
        }
        nhanXacNhan={chapNhan ? 'Chấp nhận' : 'Bác bỏ khiếu nại'}
        nguyHiem={!chapNhan}
        truongNhap={
          chapNhan
            ? { nhan: 'Ghi chú (không bắt buộc)', toiThieu: 0, toiDa: 500, goiY: 'Ví dụ: Đã đối chiếu ảnh chuyển khoản', nhieuDong: true }
            : { nhan: 'Lý do bác bỏ', toiThieu: 3, toiDa: 500, goiY: 'Ví dụ: Chủ sân đã xác nhận thanh toán đúng hạn', nhieuDong: true }
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
