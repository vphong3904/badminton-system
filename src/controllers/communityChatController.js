const dichVu = require('../services/communityChatService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

exports.lietKeTinNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKeTinNhan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maPhong, yeuCau.query));
});

exports.guiTinNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const tin = await dichVu.guiTinNhan({
    maPhong: yeuCau.params.maPhong,
    maNguoiGui: yeuCau.nguoiDung.maNguoiDung,
    noiDung: yeuCau.body?.noiDung,
  });
  thanhCong(phanHoi, tin, 201);
});

exports.lietKeThanhVien = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKeThanhVien(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maPhong));
});

exports.lietKePhongCuaToi = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKePhongCuaToi(yeuCau.nguoiDung.maNguoiDung));
});
