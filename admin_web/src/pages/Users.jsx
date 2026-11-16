/**Màn hình 2: Người dùng & Vai trò */
import React from 'react';

export default function Users({ userRoleTab, setUserRoleTab, owners, customers, onOpenGrantModal, onToggleOwnerLock }) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Người dùng & Vai trò</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Cấp tài khoản đăng nhập cho Chủ Sân, quản lý danh sách Khách hàng & phân quyền Token JWT.
          </p>
        </div>
        <button
          onClick={onOpenGrantModal}
          className="px-4 py-2.5 bg-[#165137] hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2"
        >
          + Cấp Tài Khoản Chủ Sân Mới
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setUserRoleTab('owners')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition ${
            userRoleTab === 'owners' ? 'border-[#165137] text-[#165137]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Danh Sách Chủ Sân ({owners.length})
        </button>
        <button
          onClick={() => setUserRoleTab('customers')}
          className={`py-3 px-6 text-xs font-bold border-b-2 transition ${
            userRoleTab === 'customers' ? 'border-[#165137] text-[#165137]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Danh Sách Khách Hàng ({customers.length})
        </button>
      </div>

      {userRoleTab === 'owners' ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-6">Họ tên Chủ Sân</th>
                <th className="py-4 px-6">Email / SĐT</th>
                <th className="py-4 px-6">Cơ sở sân quản lý</th>
                <th className="py-4 px-6">Trạng thái JWT</th>
                <th className="py-4 px-6 text-right">Thao tác Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {owners.map((owner) => (
                <tr key={owner.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 font-bold text-slate-900">{owner.name}</td>
                  <td className="py-4 px-6 text-slate-600">{owner.email}<br /><span className="text-[10px] text-slate-400">{owner.phone}</span></td>
                  <td className="py-4 px-6 font-semibold">{owner.venue}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${owner.status === 'Hoạt động' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {owner.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => onToggleOwnerLock(owner.id)}
                      className="px-3 py-1.5 rounded-xl font-semibold border transition border-slate-200 hover:bg-slate-100"
                    >
                      {owner.status === 'Hoạt động' ? 'Khóa tài khoản' : 'Mở khóa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden p-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200/70">
              <tr>
                <th className="py-4 px-6">Tên Khách Hàng</th>
                <th className="py-4 px-6">Số Điện Thoại</th>
                <th className="py-4 px-6">Tổng đơn đặt</th>
                <th className="py-4 px-6">Trạng thái</th>
                <th className="py-4 px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 font-bold">{c.name}</td>
                  <td className="py-4 px-6">{c.phone}</td>
                  <td className="py-4 px-6 font-semibold">{c.totalBookings} lượt đặt</td>
                  <td className="py-4 px-6"><span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">{c.status}</span></td>
                  <td className="py-4 px-6 text-right"><button className="px-3 py-1 border rounded-xl text-slate-600 hover:bg-slate-100">Khóa App</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}