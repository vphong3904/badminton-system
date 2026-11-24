const fs = require('fs');
const dichVu = require('../services/ownerService');
const dichVuDanhGia = require('../services/reviewService');
const sanCoSo = require('../services/sanCoSoService');
const dichVuKhieuNai = require('../services/complaintService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { thanhCong, daTao } = require('../utils/response');
const { phatMotSlot, phatNhieuCapNhatDatSan } = require('../realtime/datSan');

const xuLy = (hamXuLy, dinhDang = thanhCong) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => dinhDang(phanHoi, await hamXuLy(yeuCau)));
const layMaChuSan = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.layTrangThaiDangKy = xuLy((yeuCau) => dichVu.trangThaiDangKy(layMaChuSan(yeuCau)));
exports.luuBuocCoSo = xuLy((yeuCau) => dichVu.luuBuocCoSo(layMaChuSan(yeuCau), yeuCau.body));
exports.luuBuocBangGia = xuLy((yeuCau) => dichVu.luuBuocBangGia(layMaChuSan(yeuCau), yeuCau.body.khungGias));
exports.luuBuocNganHang = xuLy((yeuCau) => dichVu.luuBuocNganHang(layMaChuSan(yeuCau), yeuCau.body));
exports.doiNganHang = xuLy((yeuCau) => dichVu.doiNganHang(layMaChuSan(yeuCau), yeuCau.body));
exports.luuBuocDoanhNghiep = xuLy((yeuCau) => dichVu.luuBuocDoanhNghiep(layMaChuSan(yeuCau), yeuCau.body));
exports.guiHoSoDuyet = xuLy((yeuCau) => dichVu.guiHoSoDuyet(layMaChuSan(yeuCau)));

// Cơ sở: maCoSo lấy từ đường dẫn (/co-so/:maCoSo/...); không có thì dùng cơ sở đầu tiên (API cũ).
const layMaCoSo = (yeuCau) => yeuCau.params.maCoSo;
exports.lietKeCoSo = xuLy((yeuCau) => dichVu.layDanhSachCoSo(layMaChuSan(yeuCau)));
exports.layCoSo = xuLy((yeuCau) => dichVu.layCoSoTheoMa(layMaChuSan(yeuCau), layMaCoSo(yeuCau)));
exports.taoCoSo = xuLy((yeuCau) => dichVu.taoCoSoMoi(layMaChuSan(yeuCau), yeuCau.body), daTao);
exports.capNhatCoSo = xuLy((yeuCau) =>
  dichVu.capNhatCoSo(layMaChuSan(yeuCau), yeuCau.body, layMaCoSo(yeuCau)));
exports.capNhatBangGia = xuLy((yeuCau) =>
  dichVu.thayBangGia(layMaChuSan(yeuCau), yeuCau.body.khungGias, layMaCoSo(yeuCau)));
exports.layBangGiaCoSo = xuLy((yeuCau) => dichVu.layBangGiaCoSo(layMaChuSan(yeuCau), layMaCoSo(yeuCau)));
exports.themKhungGia = xuLy((yeuCau) =>
  dichVu.themKhungGia(layMaChuSan(yeuCau), layMaCoSo(yeuCau), yeuCau.body), daTao);
exports.capNhatAnhCoSo = xuLy((yeuCau) => {
  if (!yeuCau.file) throw AppError.duLieuKhongHopLe('Thiếu tệp ảnh (trường "tepAnh")');
  return dichVu.capNhatAnhCoSo(layMaChuSan(yeuCau), yeuCau.file, layMaCoSo(yeuCau));
});
exports.layAnhCoSo = xuLy((yeuCau) => dichVu.layAnhCoSo(layMaChuSan(yeuCau), layMaCoSo(yeuCau)));
exports.themAnhSan = xuLy((yeuCau) => {
  if (!yeuCau.files?.length) throw AppError.duLieuKhongHopLe('Thiếu tệp ảnh (trường "tepAnh")');
  return dichVu.themAnhSan(layMaChuSan(yeuCau), yeuCau.files, layMaCoSo(yeuCau));
}, daTao);
exports.datAnhBia = xuLy((yeuCau) =>
  dichVu.datAnhBia(layMaChuSan(yeuCau), layMaCoSo(yeuCau), yeuCau.params.maAnh));
exports.xoaAnhCoSo = xuLy((yeuCau) =>
  dichVu.xoaAnhCoSo(layMaChuSan(yeuCau), layMaCoSo(yeuCau), yeuCau.params.maAnh));
exports.lietKeSan = xuLy((yeuCau) => dichVu.lietKeSan(layMaChuSan(yeuCau), yeuCau.query.maCoSo));
exports.taoSan = xuLy((yeuCau) => dichVu.taoSan(layMaChuSan(yeuCau), yeuCau.body), daTao);
exports.capNhatSan = xuLy((yeuCau) =>
  dichVu.capNhatSan(layMaChuSan(yeuCau), yeuCau.params.maSan, yeuCau.body));
const nguoi = (yeuCau) => ({ maNguoiDung: layMaChuSan(yeuCau), vaiTro: 'owner' });
exports.dongSan = xuLy((yeuCau) => sanCoSo.dongSan(nguoi(yeuCau), yeuCau.params.maSan, yeuCau.body.lyDo));
exports.moSan = xuLy((yeuCau) => sanCoSo.moSan(nguoi(yeuCau), yeuCau.params.maSan));
exports.xoaSan = xuLy((yeuCau) => sanCoSo.xoaSan(nguoi(yeuCau), yeuCau.params.maSan, yeuCau.body.lyDo));
exports.dongCoSo = xuLy((yeuCau) => sanCoSo.dongCoSo(nguoi(yeuCau), yeuCau.params.maCoSo, yeuCau.body.lyDo));
exports.moCoSo = xuLy((yeuCau) => sanCoSo.moCoSo(nguoi(yeuCau), yeuCau.params.maCoSo));
exports.xoaCoSo = xuLy((yeuCau) => sanCoSo.xoaCoSo(nguoi(yeuCau), yeuCau.params.maCoSo, yeuCau.body.lyDo));
exports.xemTruocKhoaSan = xuLy((yeuCau) => dichVu.xemTruocKhoaSan(layMaChuSan(yeuCau), yeuCau.query));
exports.taoKhoaSan = xuLy(async (yeuCau) => {
  const r = await dichVu.taoKhoaSan(layMaChuSan(yeuCau), yeuCau.body);
  // Phát lịch realtime sau commit: từng dòng khoá mới + các đơn vừa chuyển/huỷ (slot sân cũ/mới + thông báo đơn).
  for (const k of r.cacKhoa) await phatMotSlot(r.maSan, k.ngay, k.gioBatDau, k.gioKetThuc);
  await phatNhieuCapNhatDatSan([...r.cacDonDaChuyen, ...r.cacDonDaHuy].map((d) => d.maDatSan));
  return r;
}, daTao);
exports.lietKeKhoaSan = xuLy((yeuCau) => dichVu.lietKeKhoaSan(layMaChuSan(yeuCau), yeuCau.query));
exports.xoaKhoaSan = xuLy(async (yeuCau) => {
  const [[k]] = await require('../config/db').pool.query('SELECT MaSan,NgayKhoa,GioBatDau,GioKetThuc FROM KhoaSan WHERE MaKhoa=?',[yeuCau.params.maKhoa]);
  await dichVu.xoaKhoaSan(layMaChuSan(yeuCau), yeuCau.params.maKhoa);
  if (k) await phatMotSlot(k.MaSan,k.NgayKhoa,k.GioBatDau,k.GioKetThuc);
  return { daXoa: true };
});

// Đánh giá của các cơ sở của chủ sân.
exports.lietKeDanhGia = xuLy((yeuCau) => dichVuDanhGia.lietKeDanhGiaChuSan(layMaChuSan(yeuCau), yeuCau.query));
exports.phanHoiDanhGia = xuLy((yeuCau) =>
  dichVuDanhGia.phanHoiDanhGia(layMaChuSan(yeuCau), yeuCau.params.maDanhGia, yeuCau.body.noiDung));
exports.xoaPhanHoiDanhGia = xuLy((yeuCau) =>
  dichVuDanhGia.xoaPhanHoiDanhGia(layMaChuSan(yeuCau), yeuCau.params.maDanhGia));

exports.lietKeKhieuNai = xuLy((yeuCau) => dichVuKhieuNai.lietKeKhieuNaiCuaChuSan(layMaChuSan(yeuCau), yeuCau.query));
exports.khangNghiKhieuNai = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  try {
    const ketQua = await dichVuKhieuNai.khangNghiKhieuNai(
      layMaChuSan(yeuCau), yeuCau.params.maKhieuNai, yeuCau.body, yeuCau.files || []);
    return thanhCong(phanHoi, ketQua);
  } catch (loi) {
    // Kháng nghị thất bại (thiếu ảnh, quá hạn, 409…) → không để lại ảnh bằng chứng mồ côi.
    (yeuCau.files || []).forEach((tep) => fs.unlink(tep.path, () => {}));
    throw loi;
  }
});
exports.phanHoiKhieuNai = xuLy((yeuCau) =>
  dichVuKhieuNai.phanHoiKhieuNai(layMaChuSan(yeuCau), yeuCau.params.maKhieuNai, yeuCau.body));
