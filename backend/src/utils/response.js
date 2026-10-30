exports.thanhCong = (phanHoi, duLieu, maTrangThai = 200) =>
  phanHoi.status(maTrangThai).json({ thanhCong: true, duLieu });
exports.daTao = (phanHoi, duLieu) => exports.thanhCong(phanHoi, duLieu, 201);
