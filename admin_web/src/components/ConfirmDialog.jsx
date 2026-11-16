/**
 * Hộp xác nhận dùng cho mọi thao tác ghi.
 * - truongNhap (tùy chọn): { nhan, toiThieu, toiDa, goiY, nhieuDong } – bắt người dùng nhập lý do / mã giao dịch,
 *   giá trị đã cắt khoảng trắng được truyền vào khiXacNhan(giaTri).
 * - loi: lỗi từ máy chủ, hiện ngay trong hộp để người dùng sửa và gửi lại.
 * - oXacNhan (tùy chọn): { nhan } – hiện ô tick; nút xác nhận chỉ bấm được sau khi tick.
 *   Không truyền thì hộp thoại hoạt động như cũ.
 */
import { useEffect, useState } from 'react';

function HopThoai({ tieuDe, noiDung, nhanXacNhan, nguyHiem, dangXuLy, loi, truongNhap, oXacNhan, khiXacNhan, khiHuy }) {
  const [giaTri, setGiaTri] = useState('');
  const [loiNhap, setLoiNhap] = useState('');
  const [daTick, setDaTick] = useState(false);
  const chuaTick = Boolean(oXacNhan) && !daTick;

  useEffect(() => {
    const khiNhanPhim = (suKien) => {
      if (suKien.key === 'Escape' && !dangXuLy) khiHuy();
    };
    window.addEventListener('keydown', khiNhanPhim);
    return () => window.removeEventListener('keydown', khiNhanPhim);
  }, [dangXuLy, khiHuy]);

  const guiDi = (suKien) => {
    suKien.preventDefault();
    if (dangXuLy || chuaTick) return;
    if (!truongNhap) {
      khiXacNhan();
      return;
    }
    const daCat = giaTri.trim();
    const toiThieu = truongNhap.toiThieu ?? 1;
    if (daCat.length < toiThieu) {
      setLoiNhap(`${truongNhap.nhan} cần tối thiểu ${toiThieu} ký tự`);
      return;
    }
    if (truongNhap.toiDa && daCat.length > truongNhap.toiDa) {
      setLoiNhap(`${truongNhap.nhan} tối đa ${truongNhap.toiDa} ký tự`);
      return;
    }
    setLoiNhap('');
    khiXacNhan(daCat);
  };

  const lopNhap =
    'w-full border rounded-xl px-3 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#165137]';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50">
      <form
        onSubmit={guiDi}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tieu-de-hop-thoai"
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4"
      >
        <h2 id="tieu-de-hop-thoai" className="text-lg font-extrabold text-slate-900">
          {tieuDe}
        </h2>
        {noiDung && <div className="text-xs text-slate-600 leading-relaxed space-y-1">{noiDung}</div>}

        {oXacNhan && (
          <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={daTick}
              onChange={(e) => setDaTick(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#165137] focus:ring-[#165137]"
            />
            <span>{oXacNhan.nhan}</span>
          </label>
        )}

        {truongNhap && (
          <div className="space-y-1.5">
            <label htmlFor="truong-nhap-hop-thoai" className="block text-xs font-bold text-slate-700">
              {truongNhap.nhan}
            </label>
            {truongNhap.nhieuDong ? (
              <textarea
                id="truong-nhap-hop-thoai"
                autoFocus
                rows={3}
                value={giaTri}
                onChange={(e) => setGiaTri(e.target.value)}
                placeholder={truongNhap.goiY}
                className={`${lopNhap} ${loiNhap ? 'border-rose-400' : 'border-slate-300'}`}
              />
            ) : (
              <input
                id="truong-nhap-hop-thoai"
                autoFocus
                type="text"
                value={giaTri}
                onChange={(e) => setGiaTri(e.target.value)}
                placeholder={truongNhap.goiY}
                className={`${lopNhap} ${loiNhap ? 'border-rose-400' : 'border-slate-300'}`}
              />
            )}
            {loiNhap && <p className="text-[11px] font-semibold text-rose-600">{loiNhap}</p>}
          </div>
        )}

        {loi && (
          <p role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {loi}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={khiHuy}
            disabled={dangXuLy}
            className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 transition disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={dangXuLy || chuaTick}
            className={`px-4 py-2.5 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-60 ${
              nguyHiem ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#165137] hover:bg-emerald-800'
            }`}
          >
            {dangXuLy ? 'Đang xử lý…' : nhanXacNhan}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ConfirmDialog({
  mo,
  tieuDe,
  noiDung,
  nhanXacNhan = 'Xác nhận',
  nguyHiem = false,
  dangXuLy = false,
  loi = '',
  truongNhap = null,
  oXacNhan = null,
  khiXacNhan,
  khiHuy,
}) {
  if (!mo) return null;
  // Gắn vào lúc mở nên ô nhập luôn bắt đầu trống
  return (
    <HopThoai
      tieuDe={tieuDe}
      noiDung={noiDung}
      nhanXacNhan={nhanXacNhan}
      nguyHiem={nguyHiem}
      dangXuLy={dangXuLy}
      loi={loi}
      truongNhap={truongNhap}
      oXacNhan={oXacNhan}
      khiXacNhan={khiXacNhan}
      khiHuy={khiHuy}
    />
  );
}
