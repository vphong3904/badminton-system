/**Màn hình 4: Quản lý Lịch đặt & Webhook Audit */
import React from 'react';

export default function Bookings({ bookings, onTriggerWebhook, onShowPayload }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Quản lý Lịch đặt & Webhook Audit</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Tra cứu toàn bộ giao dịch đặt sân, kiểm tra Webhook ngân hàng & tự động nhả giữ chỗ.
          </p>
        </div>
        <button
          onClick={onTriggerWebhook}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2"
        >
          ⚡ Bắn Webhook Giả Lập
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-2">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
            <tr>
              <th className="py-4 px-6">Mã Vé</th>
              <th className="py-4 px-6">Khách Đặt</th>
              <th className="py-4 px-6">Cơ Sở Sân</th>
              <th className="py-4 px-6">Khung Giờ Playing</th>
              <th className="py-4 px-6">Số Tiền</th>
              <th className="py-4 px-6">Trạng Thái (API)</th>
              <th className="py-4 px-6 text-right">Chi Tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-50/50">
                <td className="py-4 px-6 font-bold text-[#165137]">{booking.code}</td>
                <td className="py-4 px-6">{booking.customer}</td>
                <td className="py-4 px-6">{booking.venue}</td>
                <td className="py-4 px-6">{booking.time}</td>
                <td className="py-4 px-6 font-bold text-slate-900">{booking.amount}</td>
                <td className="py-4 px-6">
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'}`}>
                    {booking.status}
                  </span>
                </td>
                <td className="py-4 px-6 text-right">
                  <button onClick={() => onShowPayload(booking)} className="px-3 py-1.5 border border-slate-200 rounded-xl font-semibold hover:bg-slate-100">
                    Payload JSON
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}