import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function convertDir(dir, maxWidth) {
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));
  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const srcPath = path.join(dir, file);
    const ext = path.extname(file).toLowerCase();
    const webpFile = file.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    const dstPath = path.join(dir, webpFile);

    // Skip if webp already exists and is newer
    if (fs.existsSync(dstPath)) {
      const srcMtime = fs.statSync(srcPath).mtimeMs;
      const dstMtime = fs.statSync(dstPath).mtimeMs;
      if (dstMtime >= srcMtime) continue;
    }

    const before = fs.statSync(srcPath).size;
    totalBefore += before;

    await sharp(srcPath)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: 75, effort: 6 })
      .toFile(dstPath);

    const after = fs.statSync(dstPath).size;
    totalAfter += after;

    const pct = ((1 - after / before) * 100).toFixed(1);
    console.log(`${path.basename(dir)}/${file}: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (${pct}% smaller)`);
  }

  return { totalBefore, totalAfter, count: files.length };
}

(async () => {
  const dailyResult = convertDir('public/image/dailyimages', 400);
  const prodResult = convertDir('public/image/products', 224);

  const totalBefore = dailyResult.totalBefore + prodResult.totalBefore;
  const totalAfter = dailyResult.totalAfter + prodResult.totalAfter;
  console.log(`\n=== TOTAL: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller) ===`);
})();
