/**Màn hình 3: Phê duyệt & Quản lý Sân */
import React from 'react';

export default function Venues({ venueSubTab, setVenueSubTab, pendingVenues, approvedVenues, onApproveVenue, onRejectVenue, onToggleVisibility }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Phê duyệt & Quản lý Cơ sở Sân</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Duyệt cơ sở sân mới do Chủ sân khai báo, kiểm tra chuẩn hóa địa chỉ Tỉnh/Phường & Tọa độ Haversine.
        </p>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setVenueSubTab('pending')}
          className={`py-3 px-6 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
            venueSubTab === 'pending' ? 'border-[#165137] text-[#165137]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Cơ Sở Chờ Admin Duyệt</span>
          <span className="px-2 py-0.5 bg-amber-500 text-white font-bold text-[10px] rounded-full">
            {pendingVenues.length}
          </span>
        </button>
        <button
          onClick={() => setVenueSubTab('approved')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition ${
            venueSubTab === 'approved' ? 'border-[#165137] text-[#165137]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Cơ Sở Đã Hoạt Động ({approvedVenues.length})
        </button>
      </div>

      {venueSubTab === 'pending' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {pendingVenues.map((venue) => (
            <div key={venue.id} className="bg-white p-6 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm space-y-4 relative">
              <span className="absolute top-4 right-4 px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] rounded-full uppercase border border-amber-300">
                Cần Duyệt
              </span>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">{venue.name}</h3>
                <p className="text-xs text-slate-500 font-medium">Chủ sở hữu: <strong>{venue.ownerName}</strong> ({venue.ownerEmail})</p>
              </div>
              <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <p>📍 <strong>Địa chỉ chuẩn hóa:</strong> {venue.address}</p>
                <p>🌐 <strong>Tọa độ GPS:</strong> Lat: {venue.lat}, Long: {venue.long}</p>
                <p>🏸 <strong>Quy mô sân con:</strong> {venue.courtsCount} Sân tiêu chuẩn BWF</p>
                <p>💵 <strong>Giá khai báo:</strong> Thường: {venue.standardPrice} | Cao điểm: {venue.peakPrice}</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => onApproveVenue(venue)} className="flex-1 py-2.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm">✓ Phê Duyệt Ngay</button>
                <button onClick={() => onRejectVenue(venue.id)} className="px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-xl">✕ Từ Chối</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-6">Tên Cơ Sở Sân</th>
                <th className="py-4 px-6">Chi Nhánh</th>
                <th className="py-4 px-6">Giá Niêm Yết</th>
                <th className="py-4 px-6">Trạng Thái Hiển Thị</th>
                <th className="py-4 px-6 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {approvedVenues.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 font-bold text-slate-900">{v.name}</td>
                  <td className="py-4 px-6">{v.location}</td>
                  <td className="py-4 px-6 font-semibold text-[#165137]">{v.price}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${v.visible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {v.visible ? 'Hiển thị App' : 'Đã tạm ẩn'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button onClick={() => onToggleVisibility(v.id)} className="px-3 py-1.5 border border-slate-200 rounded-xl font-semibold hover:bg-slate-100">
                      {v.visible ? 'Tạm Ẩn' : 'Kích Hoạt'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}