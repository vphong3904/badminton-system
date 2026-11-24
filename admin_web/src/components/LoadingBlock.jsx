/** Khối hiển thị khi đang tải dữ liệu */
export default function LoadingBlock({ noiDung = 'Đang tải dữ liệu…' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-10 text-center text-xs font-semibold text-slate-500" role="status">
      {noiDung}
    </div>
  );
}
