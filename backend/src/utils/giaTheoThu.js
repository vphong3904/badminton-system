// Bảng giá theo TỪNG THỨ: thu 1 = Thứ 2 … 6 = Thứ 7, 7 = Chủ nhật.
// Cột BangGia.LoaiNgay vẫn được ghi (thu 1–5 = weekday, 6–7 = weekend) để tương thích dữ liệu/API cũ.
const TAT_CA_THU = [1, 2, 3, 4, 5, 6, 7];

const loaiNgayCuaThu = (thu) => (thu >= 6 ? 'weekend' : 'weekday');

// 'YYYY-MM-DD' → 1..7 (JS getUTCDay: 0 = Chủ nhật → 7).
function thuTuNgay(ngay) {
  const thu = new Date(`${ngay}T00:00:00Z`).getUTCDay();
  return thu === 0 ? 7 : thu;
}

// Khung giá (dạng mới giaTheoThu hoặc 4 trường cũ) → mảng 7 phần tử {thu, giaKhachVangLai, giaKhachCoDinh}.
function chuanHoaGiaTheoThu(khung) {
  if (Array.isArray(khung.giaTheoThu) && khung.giaTheoThu.length) {
    return [...khung.giaTheoThu].sort((a, b) => a.thu - b.thu);
  }
  return TAT_CA_THU.map((thu) => ({
    thu,
    giaKhachVangLai: thu >= 6 ? khung.giaCuoiTuanKhachVangLai : khung.giaNgayThuongKhachVangLai,
    giaKhachCoDinh: thu >= 6 ? khung.giaCuoiTuanKhachCoDinh : khung.giaNgayThuongKhachCoDinh,
  }));
}

// Các dòng INSERT BangGia (MaCoSo, Thu, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio) của một khung.
function dongBangGia(maCoSo, khung) {
  return chuanHoaGiaTheoThu(khung).flatMap((g) => [
    [maCoSo, g.thu, loaiNgayCuaThu(g.thu), 'walk_in', khung.gioBatDau, khung.gioKetThuc, g.giaKhachVangLai],
    [maCoSo, g.thu, loaiNgayCuaThu(g.thu), 'fixed', khung.gioBatDau, khung.gioKetThuc, g.giaKhachCoDinh],
  ]);
}

const COT_BANG_GIA = '(MaCoSo, Thu, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio)';

module.exports = { TAT_CA_THU, loaiNgayCuaThu, thuTuNgay, chuanHoaGiaTheoThu, dongBangGia, COT_BANG_GIA };
