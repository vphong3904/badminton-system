/**
 * Màn hình Quản lý đánh giá theo từng cơ sở: chọn cơ sở, xem đánh giá của khách, xóa đánh giá không hợp lý
 * (bắt buộc lý do) hoặc khôi phục. Đánh giá bị xóa chỉ bị ẩn khỏi ứng dụng – vẫn lưu lại nên khôi phục được.
 */
import { useCallback, useEffect, useState } from 'react';
import { anHienDanhGia, layDanhGia, layDanhSachCoSo } from '../api/admin';
import { dinhDangNgayGio } from '../utils/format';
import LoadingBlock from '../components/LoadingBlock';
import ErrorBlock from '../components/ErrorBlock';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import Toast from '../components/Toast';

const SO_DONG = 20;
const LOC_TRANG_THAI = [
  { ma: 'hien', nhan: 'Đang hiển thị' },
  { ma: 'an', nhan: 'Đã xóa' },
  { ma: 'all', nhan: 'Tất cả' },
];

function Sao({ so }) {
  return (
    <span className="text-amber-500 tracking-wide text-sm" aria-label={`${so} sao`}>
      {'★'.repeat(so)}
      <span className="text-slate-300">{'★'.repeat(5 - so)}</span>
    </span>
  );
}

export default function Reviews() {
  // Danh sách cơ sở (cột trái)
  const [cacCoSo, setCacCoSo] = useState([]);
  const [dangTaiCoSo, setDangTaiCoSo] = useState(true);
  const [loiCoSo, setLoiCoSo] = useState('');
  const [lanTaiCoSo, setLanTaiCoSo] = useState(0);
  const [tuKhoaNhap, setTuKhoaNhap] = useState('');
  const [tuKhoaCoSo, setTuKhoaCoSo] = useState('');

  // Đánh giá của cơ sở đang chọn (cột phải); maCoSo = null là tất cả cơ sở
  const [maCoSo, setMaCoSo] = useState(null);
  const [boLoc, setBoLoc] = useState({ trangThai: 'hien', soSao: '', trang: 1 });
  const [duLieu, setDuLieu] = useState(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [lanTai, setLanTai] = useState(0);

  const [hanhDong, setHanhDong] = useState(null); // { loai: 'xoa' | 'khoiPhuc', danhGia }
  const [dangXuLy, setDangXuLy] = useState(false);
  const [loiHopThoai, setLoiHopThoai] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let daHuy = false;
    layDanhSachCoSo(tuKhoaCoSo)
      .then((ketQua) => {
        if (daHuy) return;
        setCacCoSo(ketQua);
        setLoiCoSo('');
        setDangTaiCoSo(false);
      })
      .catch((e) => {
        if (daHuy) return;
        setLoiCoSo(e.message);
        setDangTaiCoSo(false);
      });
    return () => {
      daHuy = true;
    };
  }, [tuKhoaCoSo, lanTaiCoSo]);

  useEffect(() => {
    const hen = setTimeout(() => {
      const tuKhoa = tuKhoaNhap.trim();
      if (tuKhoa !== tuKhoaCoSo) {
        setDangTaiCoSo(true);
        setTuKhoaCoSo(tuKhoa);
      }
    }, 400);
    return () => clearTimeout(hen);
  }, [tuKhoaNhap, tuKhoaCoSo]);

  useEffect(() => {
    let daHuy = false;
    layDanhGia({
      maCoSo,
      trangThai: boLoc.trangThai,
      soSao: boLoc.soSao,
      trang: boLoc.trang,
      soLuong: SO_DONG,
    })
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
  }, [maCoSo, boLoc, lanTai]);

  const lamMoi = () => {
    setLanTai((n) => n + 1);
    setLanTaiCoSo((n) => n + 1);
  };
  const thuLai = () => {
    setDangTai(true);
    setLoi('');
    lamMoi();
  };
  const chonCoSo = (ma) => {
    if (ma === maCoSo) return;
    setDangTai(true);
    setLoi('');
    setMaCoSo(ma);
    setBoLoc((cu) => ({ ...cu, trang: 1 }));
  };
  const doiBoLoc = useCallback((phan) => {
    setDangTai(true);
    setLoi('');
    setBoLoc((cu) => ({ ...cu, trang: 1, ...phan }));
  }, []);
  const doiTrang = (trang) => {
    setDangTai(true);
    setBoLoc((cu) => ({ ...cu, trang }));
  };

  const moHopThoai = (loai, danhGia) => {
    setLoiHopThoai('');
    setHanhDong({ loai, danhGia });
  };

  const xacNhan = async (lyDo) => {
    const { loai, danhGia } = hanhDong;
    setDangXuLy(true);
    setLoiHopThoai('');
    try {
      await anHienDanhGia(danhGia.maDanhGia, loai === 'xoa' ? { an: true, lyDo } : { an: false });
      setToast({
        loai: 'thanhCong',
        noiDung:
          loai === 'xoa'
            ? `Đã xóa đánh giá của ${danhGia.tenKhach}. Điểm cơ sở đã được tính lại.`
            : `Đã khôi phục đánh giá của ${danhGia.tenKhach}.`,
      });
      setHanhDong(null);
      lamMoi();
    } catch (e) {
      if (e.maTrangThai === 409 || e.maTrangThai === 404) {
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

  const coSoDangChon = cacCoSo.find((muc) => muc.maCoSo === maCoSo);
  const cacDanhGia = duLieu?.cacDanhGia || [];
  const tongTrang = duLieu ? Math.max(1, Math.ceil(duLieu.tong / duLieu.soDongMoiTrang)) : 1;
  const xoa = hanhDong?.loai === 'xoa';

  const lopNutCoSo = (dangChon) =>
    `w-full text-left px-4 py-3 rounded-xl transition border ${
      dangChon ? 'bg-emerald-50 border-[#165137] shadow-sm' : 'bg-white border-transparent hover:bg-slate-50'
    }`;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Quản lý đánh giá</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Chọn từng cơ sở để xem đánh giá của khách và xóa những đánh giá không hợp lý (xúc phạm, spam, sai sự thật…).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[19rem_1fr] gap-5 items-start">
        {/* Cột trái: danh sách cơ sở */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3 space-y-3">
          <input
            type="search"
            value={tuKhoaNhap}
            onChange={(e) => setTuKhoaNhap(e.target.value)}
            placeholder="Tìm cơ sở hoặc chủ sân"
            aria-label="Tìm cơ sở"
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#165137]"
          />
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-0.5">
            <button type="button" onClick={() => chonCoSo(null)} className={lopNutCoSo(maCoSo === null)}>
              <span className="block text-xs font-extrabold text-slate-900">Tất cả cơ sở</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Xem đánh giá của mọi cơ sở</span>
            </button>
            {dangTaiCoSo ? (
              <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500" role="status">
                Đang tải cơ sở…
              </p>
            ) : loiCoSo ? (
              <p className="px-4 py-4 text-xs font-semibold text-rose-700" role="alert">
                {loiCoSo}
              </p>
            ) : cacCoSo.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">Không tìm thấy cơ sở nào.</p>
            ) : (
              cacCoSo.map((coSo) => (
                <button
                  key={coSo.maCoSo}
                  type="button"
                  onClick={() => chonCoSo(coSo.maCoSo)}
                  aria-current={maCoSo === coSo.maCoSo ? 'true' : undefined}
                  className={lopNutCoSo(maCoSo === coSo.maCoSo)}
                >
                  <span className="block text-xs font-extrabold text-slate-900">{coSo.tenCoSo}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">Chủ sân: {coSo.tenChuSan}</span>
                  <span className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-semibold text-slate-700">
                    <span>
                      <span className="text-amber-500">★</span> {coSo.soDanhGia > 0 ? coSo.diemTrungBinh.toFixed(1) : '—'}
                    </span>
                    <span className="text-slate-500">{coSo.soDanhGia} đánh giá</span>
                    {coSo.soDanhGiaDaXoa > 0 && <StatusBadge nhan={`${coSo.soDanhGiaDaXoa} đã xóa`} mau="do" />}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Cột phải: đánh giá */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{coSoDangChon ? coSoDangChon.tenCoSo : 'Tất cả cơ sở'}</h2>
                {coSoDangChon && (
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Chủ sân {coSoDangChon.tenChuSan} · điểm trung bình{' '}
                    <strong className="text-slate-800">
                      {coSoDangChon.soDanhGia > 0 ? coSoDangChon.diemTrungBinh.toFixed(1) : 'chưa có'}
                    </strong>{' '}
                    ({coSoDangChon.soDanhGia} đánh giá hiển thị)
                  </p>
                )}
              </div>
              {duLieu && !dangTai && <p className="text-xs font-semibold text-slate-500">{duLieu.tong} đánh giá</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-slate-200 overflow-hidden" role="group" aria-label="Lọc theo trạng thái đánh giá">
                {LOC_TRANG_THAI.map((muc) => (
                  <button
                    key={muc.ma}
                    type="button"
                    onClick={() => boLoc.trangThai !== muc.ma && doiBoLoc({ trangThai: muc.ma })}
                    aria-pressed={boLoc.trangThai === muc.ma}
                    className={`px-4 py-2 text-xs font-bold transition ${
                      boLoc.trangThai === muc.ma ? 'bg-[#165137] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {muc.nhan}
                  </button>
                ))}
              </div>
              <select
                value={boLoc.soSao}
                onChange={(e) => doiBoLoc({ soSao: e.target.value })}
                aria-label="Lọc theo số sao"
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#165137]"
              >
                <option value="">Tất cả số sao</option>
                {[5, 4, 3, 2, 1].map((so) => (
                  <option key={so} value={so}>
                    {so} sao
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dangTai ? (
            <LoadingBlock />
          ) : loi ? (
            <ErrorBlock thongBao={loi} khiThuLai={thuLai} />
          ) : cacDanhGia.length === 0 ? (
            <EmptyState noiDung="Không có đánh giá nào phù hợp." />
          ) : (
            <>
              <div className="space-y-4">
                {cacDanhGia.map((dg) => (
                  <article
                    key={dg.maDanhGia}
                    className={`bg-white p-5 rounded-2xl border shadow-sm space-y-3 ${
                      dg.biAn ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200/90'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <Sao so={dg.soSao} />
                          <span className="text-xs font-extrabold text-slate-900">{dg.tenKhach}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {maCoSo === null && <span className="font-semibold text-slate-700">{dg.tenCoSo} · </span>}
                          Đơn {dg.maDon} · {dinhDangNgayGio(dg.ngayTao)}
                        </p>
                      </div>
                      {dg.biAn && <StatusBadge nhan="Đã xóa" mau="do" />}
                    </div>

                    <p className={`text-xs leading-relaxed whitespace-pre-line break-words ${dg.noiDung ? 'text-slate-800' : 'italic text-slate-400'}`}>
                      {dg.noiDung || 'Khách chỉ chấm sao, không viết nhận xét.'}
                    </p>

                    {dg.phanHoiChuSan && (
                      <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                        <p className="font-bold text-slate-600 mb-1">Phản hồi của chủ sân ({dinhDangNgayGio(dg.ngayPhanHoi)})</p>
                        <p className="text-slate-800 whitespace-pre-line break-words">{dg.phanHoiChuSan}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      {dg.biAn ? (
                        <button
                          type="button"
                          onClick={() => moHopThoai('khoiPhuc', dg)}
                          className="px-3 py-1.5 rounded-xl font-bold text-xs border border-emerald-200 text-[#165137] bg-emerald-50 hover:bg-emerald-100 transition"
                        >
                          Khôi phục
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moHopThoai('xoa', dg)}
                          className="px-3 py-1.5 rounded-xl font-bold text-xs border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition"
                        >
                          Xóa đánh giá
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {tongTrang > 1 && (
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>
                    Trang {boLoc.trang}/{tongTrang}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={boLoc.trang <= 1}
                      onClick={() => doiTrang(boLoc.trang - 1)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      disabled={boLoc.trang >= tongTrang}
                      onClick={() => doiTrang(boLoc.trang + 1)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        mo={Boolean(hanhDong)}
        tieuDe={xoa ? 'Xóa đánh giá?' : 'Khôi phục đánh giá?'}
        noiDung={
          xoa ? (
            <>
              <p>
                Đánh giá {hanhDong?.danhGia.soSao} sao của <strong>{hanhDong?.danhGia.tenKhach}</strong> về{' '}
                <strong>{hanhDong?.danhGia.tenCoSo}</strong> sẽ biến mất khỏi ứng dụng.
              </p>
              <p>Điểm trung bình của cơ sở được tính lại. Khách và chủ sân đều nhận thông báo kèm lý do bạn nhập.</p>
            </>
          ) : (
            <p>
              Đánh giá của <strong>{hanhDong?.danhGia.tenKhach}</strong> sẽ hiển thị lại trên ứng dụng và được tính lại vào điểm
              trung bình của cơ sở.
            </p>
          )
        }
        nhanXacNhan={xoa ? 'Xóa đánh giá' : 'Khôi phục'}
        nguyHiem={xoa}
        truongNhap={
          xoa
            ? { nhan: 'Lý do xóa', toiThieu: 3, toiDa: 255, goiY: 'Ví dụ: Ngôn từ xúc phạm, nội dung không liên quan', nhieuDong: true }
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
