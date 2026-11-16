/*Thông báo Toast*/
/** Thông báo nổi ở góc dưới phải, tự tắt sau 4 giây. toast = { loai: 'thanhCong' | 'loi', noiDung } */
import { useEffect } from 'react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const hen = setTimeout(onClose, 4000);
    return () => clearTimeout(hen);
  }, [toast, onClose]);

  if (!toast) return null;
  const laLoi = toast.loai === 'loi';
  return (
    <div
      role={laLoi ? 'alert' : 'status'}
      className={`fixed bottom-6 right-6 z-50 max-w-sm flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg border text-xs font-semibold ${
        laLoi ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}
    >
      <span className="flex-1 leading-relaxed">{toast.noiDung}</span>
      <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Đóng thông báo">
        Đóng
      </button>
    </div>
  );
}
