// Điền ViDo/KinhDo cho các cơ sở đã có (đọc từ LinkBanDo). Chạy 1 lần sau khi chạy migration-don-dep-csdl.sql:
//   node scripts/capNhatToaDoCoSo.js          -> chỉ cơ sở đang thiếu toạ độ
//   node scripts/capNhatToaDoCoSo.js --tat-ca -> đọc lại toạ độ của mọi cơ sở
const { pool } = require('../src/config/db');
const { layToaDoTuLink } = require('../src/utils/toaDoBanDo');

(async () => {
  const tatCa = process.argv.includes('--tat-ca');
  const [cacCoSo] = await pool.query(
    `SELECT MaCoSo, TenCoSo, LinkBanDo FROM CoSo ${tatCa ? '' : 'WHERE ViDo IS NULL OR KinhDo IS NULL'}`);
  let capNhat = 0;
  for (const coSo of cacCoSo) {
    const toaDo = await layToaDoTuLink(coSo.LinkBanDo);
    if (!toaDo) {
      console.log(`✗ #${coSo.MaCoSo} ${coSo.TenCoSo}: không đọc được toạ độ từ link (${coSo.LinkBanDo})`);
      continue;
    }
    await pool.query('UPDATE CoSo SET ViDo=?, KinhDo=? WHERE MaCoSo=?', [toaDo.viDo, toaDo.kinhDo, coSo.MaCoSo]);
    console.log(`✓ #${coSo.MaCoSo} ${coSo.TenCoSo}: ${toaDo.viDo}, ${toaDo.kinhDo}`);
    capNhat += 1;
  }
  console.log(`Xong: ${capNhat}/${cacCoSo.length} cơ sở được cập nhật.`);
  await pool.end();
})().catch((loi) => { console.error(loi); process.exit(1); });
