const dichVu = require('../services/ownerService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { thanhCong, daTao } = require('../utils/response');
const { layDuongDanTep } = require('../middlewares/upload');

const xuLy = (hamXuLy, dinhDang = thanhCong) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => dinhDang(phanHoi, await hamXuLy(yeuCau)));
const layMaChuSan = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.layTrangThaiDangKy = xuLy((yeuCau) => dichVu.trangThaiDangKy(layMaChuSan(yeuCau)));
exports.luuBuocCoSo = xuLy((yeuCau) => dichVu.luuBuocCoSo(layMaChuSan(yeuCau), yeuCau.body));
exports.luuBuocBangGia = xuLy((yeuCau) => dichVu.luuBuocBangGia(layMaChuSan(yeuCau), yeuCau.body.khungGias));
exports.luuBuocNganHang = xuLy((yeuCau) => dichVu.luuBuocNganHang(layMaChuSan(yeuCau), yeuCau.body));
exports.guiHoSoDuyet = xuLy((yeuCau) => dichVu.guiHoSoDuyet(layMaChuSan(yeuCau)));

exports.layCoSo = xuLy((yeuCau) => dichVu.layCoSo(layMaChuSan(yeuCau)));
exports.capNhatCoSo = xuLy((yeuCau) => dichVu.capNhatCoSo(layMaChuSan(yeuCau), yeuCau.body));
exports.capNhatBangGia = xuLy((yeuCau) => dichVu.thayBangGia(layMaChuSan(yeuCau), yeuCau.body.khungGias));
exports.capNhatAnhCoSo = xuLy((yeuCau) => {
  if (!yeuCau.file) throw AppError.duLieuKhongHopLe('Thiếu tệp ảnh (trường "tepAnh")');
  return dichVu.capNhatAnhCoSo(layMaChuSan(yeuCau), layDuongDanTep(yeuCau.file));
});
exports.lietKeSan = xuLy((yeuCau) => dichVu.lietKeSan(layMaChuSan(yeuCau)));
exports.taoSan = xuLy((yeuCau) => dichVu.taoSan(layMaChuSan(yeuCau), yeuCau.body), daTao);
exports.capNhatSan = xuLy((yeuCau) =>
  dichVu.capNhatSan(layMaChuSan(yeuCau), yeuCau.params.maSan, yeuCau.body));
exports.taoKhoaSan = xuLy((yeuCau) => dichVu.taoKhoaSan(layMaChuSan(yeuCau), yeuCau.body), daTao);
exports.lietKeKhoaSan = xuLy((yeuCau) => dichVu.lietKeKhoaSan(layMaChuSan(yeuCau), yeuCau.query));
exports.xoaKhoaSan = xuLy(async (yeuCau) => {
  await dichVu.xoaKhoaSan(layMaChuSan(yeuCau), yeuCau.params.maKhoa);
  return { daXoa: true };
});
