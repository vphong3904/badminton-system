/** Khối hiển thị khi danh sách rỗng */
export default function EmptyState({ noiDung }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs font-semibold text-slate-500">
      {noiDung}
    </div>
  );
}
