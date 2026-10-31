const dichVu = require('../services/ownerReportService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');

const xuLy = (hamXuLy, dinhDang = thanhCong) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => dinhDang(phanHoi, await hamXuLy(yeuCau)));
const layMaChuSan = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.layDoanhThu = xuLy((yeuCau) => dichVu.layDoanhThu(layMaChuSan(yeuCau), yeuCau.query.nam));
exports.layTopKhach = xuLy((yeuCau) => dichVu.layTopKhach(layMaChuSan(yeuCau), yeuCau.query));
exports.layTopSan = xuLy((yeuCau) => dichVu.layTopSan(layMaChuSan(yeuCau), yeuCau.query));
exports.layCongNo = xuLy((yeuCau) => dichVu.layCongNo(layMaChuSan(yeuCau)));
exports.laySoDuRutTien = xuLy((yeuCau) => dichVu.laySoDuRutTien(layMaChuSan(yeuCau)));
exports.taoYeuCauRutTien = xuLy((yeuCau) =>
  dichVu.taoYeuCauRutTien(layMaChuSan(yeuCau)), daTao);
