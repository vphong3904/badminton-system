/** Nhãn trạng thái. mau: xanh | vang | do | xanhDuong | xam */
const MAU = {
  xanh: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vang: 'bg-amber-50 text-amber-800 border-amber-200',
  do: 'bg-rose-50 text-rose-700 border-rose-200',
  xanhDuong: 'bg-sky-50 text-sky-700 border-sky-200',
  xam: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function StatusBadge({ nhan, mau = 'xam' }) {
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full border ${MAU[mau] || MAU.xam}`}>
      {nhan}
    </span>
  );
}
