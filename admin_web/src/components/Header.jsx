/** Thanh trên cùng: tên hệ thống và người đang đăng nhập */
export default function Header({ tenAdmin }) {
  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between shrink-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <div>
          <span className="text-xl font-black tracking-wider text-[#165137] uppercase">Badminton Booking</span>
          <div className="h-1 bg-[#165137] w-full mt-0.5 rounded-full"></div>
        </div>
        <span className="hidden md:inline-block px-2.5 py-0.5 bg-emerald-50 text-[#165137] border border-emerald-100 font-bold text-[11px] rounded-full">
          Quản trị
        </span>
      </div>
      <div className="text-xs font-semibold text-slate-600">
        Xin chào, <span className="font-bold text-slate-900">{tenAdmin}</span>
      </div>
    </header>
  );
}
