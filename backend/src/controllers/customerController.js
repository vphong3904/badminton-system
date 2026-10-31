const dichVu = require('../services/customerService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');

const xuLy = (hamXuLy, dinhDang = thanhCong) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => dinhDang(phanHoi, await hamXuLy(yeuCau)));

exports.timCoSo = xuLy((yeuCau) => dichVu.timCoSo(yeuCau.query));
exports.layChiTietCoSo = xuLy((yeuCau) => dichVu.layChiTietCoSo(yeuCau.params.maCoSo));
exports.layChiTietSan = xuLy((yeuCau) => dichVu.layChiTietSan(yeuCau.params.maSan));
exports.kiemTraTrong = xuLy((yeuCau) => dichVu.kiemTraTrong(yeuCau.params.maSan, yeuCau.query));
exports.datLe = xuLy((yeuCau) =>
  dichVu.taoDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.body), daTao);
exports.datCoDinh = xuLy((yeuCau) =>
  dichVu.taoDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.body, yeuCau.body.ngayKetThuc), daTao);
exports.lietKeDatSan = xuLy((yeuCau) => dichVu.lietKeDatSan(yeuCau.nguoiDung.maNguoiDung));
exports.layHoaDonNhap = xuLy((yeuCau) =>
  dichVu.layHoaDonNhap(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
exports.huyDatSan = xuLy((yeuCau) =>
  dichVu.huyDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
exports.capNhatTaiKhoanHoan = xuLy((yeuCau) =>
  dichVu.capNhatTaiKhoanHoan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body));
