/** Khối hiển thị khi tải dữ liệu lỗi, có nút Thử lại */
export default function ErrorBlock({ thongBao, khiThuLai }) {
  return (
    <div className="bg-rose-50 rounded-2xl border border-rose-200 p-8 text-center space-y-3" role="alert">
      <p className="text-xs font-semibold text-rose-800">{thongBao || 'Không tải được dữ liệu'}</p>
      {khiThuLai && (
        <button
          type="button"
          onClick={khiThuLai}
          className="px-4 py-2 bg-white border border-rose-200 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-100 transition"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
