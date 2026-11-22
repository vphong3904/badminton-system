// Trạng thái ĐƠN hiển thị cho khách: backend tính từ 3 cột (DatSan.TrangThai, ThanhToan.TrangThai,
// ThanhToan.TrangThaiHoanTien), app chỉ hiển thị nhãn + gom tab. Hàm thuần, không đụng DB.
// Nhóm tab: sap_toi (Sắp tới) · hoan_thanh (Đã hoàn thành) · da_huy (Đã hủy).

const NHOM = { SAP_TOI: 'sap_toi', HOAN_THANH: 'hoan_thanh', DA_HUY: 'da_huy' };

const BANG_TRANG_THAI = {
  awaiting_payment: { nhan: 'Đã đặt, chờ thanh toán', nhom: NHOM.SAP_TOI },
  awaiting_owner_approval: { nhan: 'Chờ chủ sân duyệt', nhom: NHOM.SAP_TOI },
  payment_rejected: { nhan: 'Bị từ chối, gửi lại ảnh', nhom: NHOM.SAP_TOI },
  paid: { nhan: 'Thanh toán thành công (đã duyệt)', nhom: NHOM.SAP_TOI },
  completed: { nhan: 'Hoàn thành', nhom: NHOM.HOAN_THANH },
  cancelled_refund_pending: { nhan: 'Đã hủy, chờ hoàn tiền', nhom: NHOM.DA_HUY },
  cancelled_refunded: { nhan: 'Đã hủy, đã hoàn tiền', nhom: NHOM.DA_HUY },
  cancelled_refund_failed: { nhan: 'Đã hủy, hoàn tiền thất bại', nhom: NHOM.DA_HUY },
  cancelled_no_refund: { nhan: 'Đã hủy, không hoàn tiền', nhom: NHOM.DA_HUY },
  cancelled_unpaid: { nhan: 'Đã hủy (chưa thanh toán)', nhom: NHOM.DA_HUY },
  expired: { nhan: 'Hết hạn giữ chỗ', nhom: NHOM.DA_HUY },
  late_payment_refund_pending: { nhan: 'Quá hạn, chờ admin hoàn tiền', nhom: NHOM.DA_HUY },
  late_payment_refunded: { nhan: 'Quá hạn, đã hoàn tiền', nhom: NHOM.DA_HUY },
  // Trạng thái mới (Task 0.6; mục C của TAI_LIEU_THUC_HIEN.md). Slot của các đơn này VẪN được giữ (SLOT_BAN).
  awaiting_admin_overdue: { nhan: 'Quá hạn xác nhận, chờ Admin', nhom: NHOM.SAP_TOI },
  awaiting_reconcile: { nhan: 'Chờ đối soát giao dịch', nhom: NHOM.SAP_TOI },
  awaiting_topup: { nhan: 'Chuyển thiếu, cần bổ sung tiền', nhom: NHOM.SAP_TOI },
  paid_overpay_refund_pending: { nhan: 'Đã xác nhận, chờ hoàn tiền chuyển dư', nhom: NHOM.SAP_TOI },
  checked_in: { nhan: 'Đã check-in', nhom: NHOM.SAP_TOI },
  no_show: { nhan: 'Không đến sân', nhom: NHOM.DA_HUY },
  cancelled_refund_received: { nhan: 'Đã hủy, đã nhận lại tiền', nhom: NHOM.DA_HUY },
};

// Dữ liệu thiếu/lạ (vd null, giá trị enum mới chưa biết) → nhãn mặc định, không ném lỗi.
const MAC_DINH = { ma: 'unknown', nhan: 'Không xác định', nhom: NHOM.SAP_TOI };

function xacDinhMa({ trangThai, trangThaiThanhToan, trangThaiHoanTien, loaiHoanTien, lyDoTuChoi }) {
  switch (trangThai) {
    case 'pending_payment':
      if (trangThaiThanhToan === 'confirming') return 'awaiting_owner_approval';
      if (trangThaiThanhToan === 'overdue') return 'awaiting_admin_overdue';
      if (trangThaiThanhToan === 'reconciling') return 'awaiting_reconcile';
      if (trangThaiThanhToan === 'underpaid') return 'awaiting_topup';
      if (trangThaiThanhToan === 'pending' && lyDoTuChoi) return 'payment_rejected';
      return 'awaiting_payment';
    case 'confirmed':
      // Đã trả đủ nhưng còn khoản chuyển dư chờ hoàn (HoanTien.Loai='overpay') → hiện riêng, đơn vẫn hiệu lực.
      if (loaiHoanTien === 'overpay' && (trangThaiHoanTien === 'waiting_info' || trangThaiHoanTien === 'processing')) {
        return 'paid_overpay_refund_pending';
      }
      return 'paid';
    case 'checked_in':
      return 'checked_in';
    case 'no_show':
      return 'no_show';
    case 'completed':
      return 'completed';
    case 'cancelled': {
      if (trangThaiThanhToan !== 'success') return 'cancelled_unpaid';
      if (trangThaiHoanTien === 'processing' || trangThaiHoanTien === 'waiting_info') {
        return 'cancelled_refund_pending';
      }
      if (trangThaiHoanTien === 'refunded') return 'cancelled_refunded';
      if (trangThaiHoanTien === 'received') return 'cancelled_refund_received';
      if (trangThaiHoanTien === 'failed') return 'cancelled_refund_failed';
      return 'cancelled_no_refund'; // none (hủy dưới 12 giờ, số tiền hoàn 0) hoặc thiếu dữ liệu
    }
    case 'expired':
      if (trangThaiThanhToan === 'late_payment') {
        return ['refunded', 'received'].includes(trangThaiHoanTien) ? 'late_payment_refunded' : 'late_payment_refund_pending';
      }
      return 'expired';
    default:
      return null;
  }
}

// → { ma, nhan, nhom }
function tinhTrangThaiHienThi(thongTin) {
  const ma = xacDinhMa(thongTin || {});
  if (!ma) return { ...MAC_DINH };
  return { ma, ...BANG_TRANG_THAI[ma] };
}

// Gắn 3 trường vào 1 dòng đơn: trangThaiHienThi, nhanTrangThai, nhomTrangThai.
function ganTrangThaiHienThi(don) {
  const { ma, nhan, nhom } = tinhTrangThaiHienThi({
    trangThai: don.trangThai ?? don.trangThaiDatSan,
    trangThaiThanhToan: don.trangThaiThanhToan,
    trangThaiHoanTien: don.trangThaiHoanTien,
    loaiHoanTien: don.loaiHoanTien,
    soTienHoan: don.soTienHoan,
    lyDoTuChoi: don.lyDoTuChoi,
  });
  return { ...don, trangThaiHienThi: ma, nhanTrangThai: nhan, nhomTrangThai: nhom };
}

module.exports = { tinhTrangThaiHienThi, ganTrangThaiHienThi, BANG_TRANG_THAI, NHOM };
