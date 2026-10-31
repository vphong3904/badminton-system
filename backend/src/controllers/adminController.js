const dichVu = require('../services/adminService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

const xuLy = (hamXuLy) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => thanhCong(phanHoi, await hamXuLy(yeuCau)));
const layMaQuanTri = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.lietKeHoSoChoDuyet = xuLy(() => dichVu.lietKeHoSoChoDuyet());
exports.duyetHoSo = xuLy((yeuCau) =>
  dichVu.duyetHoSo(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body));
exports.lietKeHoanTien = xuLy(() => dichVu.lietKeHoanTien());
exports.lietKeGiaoDichSePay = xuLy(() => dichVu.lietKeGiaoDichSePay());
exports.xuLyHoanTien = xuLy((yeuCau) =>
  dichVu.xuLyHoanTien(layMaQuanTri(yeuCau), yeuCau.params.maThanhToan));
exports.hoanTatHoanTien = xuLy((yeuCau) =>
  dichVu.hoanTatHoanTien(
    layMaQuanTri(yeuCau), yeuCau.params.maThanhToan, yeuCau.body.maGiaoDichHoan));
exports.lietKeRutTien = xuLy(() => dichVu.lietKeRutTien());
exports.xacNhanChiRutTien = xuLy((yeuCau) =>
  dichVu.xacNhanChiRutTien(
    layMaQuanTri(yeuCau), yeuCau.params.maYeuCau, yeuCau.body.maGiaoDich));
exports.tuChoiRutTien = xuLy((yeuCau) =>
  dichVu.tuChoiRutTien(
    layMaQuanTri(yeuCau), yeuCau.params.maYeuCau, yeuCau.body.lyDoTuChoi));
exports.lietKeNhatKy = xuLy((yeuCau) => dichVu.lietKeNhatKy(yeuCau.query));
