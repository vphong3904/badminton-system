/** Màn hình Tổng quan: số việc đang chờ xử lý và hoạt động gần đây */
import { useEffect, useState } from 'react';
import {
  layHoSoChoDuyet,
  layNhatKy,
} from '../api/admin';
import { dinhDangNgayGio, nhanHanhDong } from '../utils/format';
import EmptyState from '../components/EmptyState';

const layNhatKyMoiNhat = () => layNhatKy({ gioiHan: 10 });


/** Mỗi khối tải độc lập: một khối lỗi không làm hỏng các khối còn lại */
function useTaiDuLieu(hamTai) {
  const [trangThai, setTrangThai] = useState({ dangTai: true, loi: '', duLieu: null });
  const [lanTai, setLanTai] = useState(0);

  useEffect(() => {
    let daHuy = false;
    hamTai()
      .then((duLieu) => {
        if (!daHuy) setTrangThai({ dangTai: false, loi: '', duLieu });
      })
      .catch((e) => {
        if (!daHuy) setTrangThai({ dangTai: false, loi: e.message, duLieu: null });
      });
    return () => {
      daHuy = true;
    };
  }, [hamTai, lanTai]);

  const thuLai = () => {
    setTrangThai({ dangTai: true, loi: '', duLieu: null });
    setLanTai((n) => n + 1);
  };
  return { ...trangThai, thuLai };
}

function TheSoLieu({ tieuDe, trangThai, giaTri, phu, tabDich, doiTab }) {
  const { dangTai, loi, duLieu, thuLai } = trangThai;
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between gap-3 min-h-[148px]">
      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">{tieuDe}</span>
        {dangTai ? (
          <p className="text-xs font-semibold text-slate-400 pt-2" role="status">Đang tải…</p>
        ) : loi ? (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-semibold text-rose-700">Không tải được</p>
            <button type="button" onClick={thuLai} className="px-3 py-1 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-50">
              Thử lại
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-3xl font-extrabold text-slate-900">{giaTri(duLieu)}</h2>
            {phu && phu(duLieu) && <p className="text-[11px] text-slate-500 font-medium">{phu(duLieu)}</p>}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => doiTab(tabDich)}
        className="self-start text-xs font-bold text-[#165137] hover:underline"
      >
        Xem chi tiết
      </button>
    </div>
  );
}

export default function Dashboard({ doiTab }) {
  const hoSo = useTaiDuLieu(layHoSoChoDuyet);
  const nhatKy = useTaiDuLieu(layNhatKyMoiNhat);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tổng quan</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">Những việc đang chờ bạn xử lý.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TheSoLieu
          tieuDe="Hồ sơ chủ sân chờ duyệt"
          trangThai={hoSo}
          giaTri={(d) => d.length}
          tabDich="owners"
          doiTab={doiTab}
        />
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Hoạt động gần đây</h3>
          <button type="button" onClick={() => doiTab('logs')} className="text-xs font-bold text-[#165137] hover:underline">
            Xem toàn bộ nhật ký
          </button>
        </div>

        {nhatKy.dangTai ? (
          <p className="text-xs font-semibold text-slate-400" role="status">Đang tải…</p>
        ) : nhatKy.loi ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-rose-700">{nhatKy.loi}</p>
            <button type="button" onClick={nhatKy.thuLai} className="px-3 py-1 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-50">
              Thử lại
            </button>
          </div>
        ) : nhatKy.duLieu.length === 0 ? (
          <EmptyState noiDung="Chưa có hoạt động nào được ghi nhận." />
        ) : (
          <div className="text-xs">
            <div className="hidden md:grid md:grid-cols-[1.2fr_1.4fr_2fr_1fr] gap-4 pb-2 border-b border-slate-200 font-bold text-slate-700">
              <span>Người thực hiện</span>
              <span>Hành động</span>
              <span>Chi tiết</span>
              <span>Thời gian</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {nhatKy.duLieu.map((nk) => (
                <li key={nk.maNhatKy} className="py-3 grid grid-cols-1 md:grid-cols-[1.2fr_1.4fr_2fr_1fr] gap-1 md:gap-4 items-start">
                  <span className="text-slate-800 font-medium">{nk.tenNguoiThucHien || 'Hệ thống'}</span>
                  <span className="font-bold text-slate-900">{nhanHanhDong(nk.hanhDong)}</span>
                  <span className="text-slate-600 break-words">{nk.chiTiet || '—'}</span>
                  <span className="text-slate-500 whitespace-nowrap">{dinhDangNgayGio(nk.ngayTao)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
