/** Menu bên trái. soChoXuLy = { owners, complaints, proofs } hiện thành huy hiệu số việc đang chờ */
const MUC_MENU = [
  { tab: 'dashboard', nhan: 'Tổng quan' },
  { tab: 'users', nhan: 'Quản lý tài khoản' },
  { tab: 'owners', nhan: 'Duyệt hồ sơ chủ sân' },
  { tab: 'complaints', nhan: 'Khiếu nại của Khách hàng' },
  { tab: 'reviews', nhan: 'Quản lý đánh giá' },
  { tab: 'proofs', nhan: 'Chờ xác nhận / quá hạn' },
  { tab: 'logs', nhan: 'Nhật ký hệ thống' },
];

export default function Sidebar({ tabHienTai, doiTab, soChoXuLy = {}, nguoiDung, khiDangXuat }) {
  const chuCai = (nguoiDung?.hoTen || 'AD')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((tu) => tu[0])
    .join('')
    .toUpperCase();

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 p-5 flex flex-col justify-between shrink-0 z-20 shadow-sm overflow-y-auto">
      <div className="space-y-4">
        <div className="px-3 text-[11px] font-extrabold text-slate-400 tracking-wider">Danh mục quản trị</div>
        <nav className="space-y-1 font-medium text-xs" aria-label="Menu quản trị">
          {MUC_MENU.map((muc) => {
            const dangChon = tabHienTai === muc.tab;
            const so = soChoXuLy[muc.tab];
            return (
              <button
                key={muc.tab}
                type="button"
                onClick={() => doiTab(muc.tab)}
                aria-current={dangChon ? 'page' : undefined}
                className={`w-full text-left px-4 py-2.5 rounded-xl transition flex items-center justify-between gap-2.5 ${
                  dangChon ? 'font-bold bg-[#165137] text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{muc.nhan}</span>
                {so > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white font-bold text-[10px] rounded-full">{so}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-100 space-y-3 mt-6">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#165137] text-white font-bold flex items-center justify-center rounded-lg text-xs shrink-0">
            {chuCai}
          </div>
          <div className="truncate text-left">
            <div className="font-bold text-xs text-slate-900 truncate">{nguoiDung?.hoTen}</div>
            <div className="text-[10px] text-slate-500 truncate">{nguoiDung?.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={khiDangXuat}
          className="w-full py-2 px-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-rose-50 hover:text-rose-700 transition"
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
