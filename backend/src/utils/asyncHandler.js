module.exports = (hamXuLy) => (yeuCau, phanHoi, goiTiep) =>
  Promise.resolve(hamXuLy(yeuCau, phanHoi, goiTiep)).catch(goiTiep);
