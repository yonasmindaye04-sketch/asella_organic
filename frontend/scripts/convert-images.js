import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

async function convertDir(relativeDir, maxWidth, quality = 85, force = false) {
  const dir = path.join(frontendDir, relativeDir);
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return { totalBefore: 0, totalAfter: 0, count: 0 };
  }

  const files = fs.readdirSync(dir).filter(f =>
    f.toLowerCase().endsWith('.png') ||
    f.toLowerCase().endsWith('.jpg') ||
    f.toLowerCase().endsWith('.jpeg')
  );

  let totalBefore = 0;
  let totalAfter = 0;
  let convertedCount = 0;

  for (const file of files) {
    const srcPath = path.join(dir, file);
    const webpFile = file.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    const dstPath = path.join(dir, webpFile);

    if (!force && fs.existsSync(dstPath)) {
      const srcMtime = fs.statSync(srcPath).mtimeMs;
      const dstMtime = fs.statSync(dstPath).mtimeMs;
      if (dstMtime >= srcMtime) continue;
    }

    const before = fs.statSync(srcPath).size;
    totalBefore += before;

    // Convert to high-definition WebP (using temporary file to avoid write collisions)
    const tempPath = `${dstPath}.tmp.webp`;
    await sharp(srcPath)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toFile(tempPath);

    fs.renameSync(tempPath, dstPath);

    const after = fs.statSync(dstPath).size;
    totalAfter += after;
    convertedCount++;

    const pct = ((1 - after / before) * 100).toFixed(1);
    console.log(`${path.basename(dir)}/${file}: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (${pct}% smaller)`);
  }

  return { totalBefore, totalAfter, count: convertedCount };
}

(async () => {
  console.log('Generating crisp WebP assets...');
  const dailyResult = await convertDir('public/image/dailyimages', 1600, 85, true);
  const prodResult = await convertDir('public/image/products', 1080, 85, true);

  const totalBefore = dailyResult.totalBefore + prodResult.totalBefore;
  const totalAfter = dailyResult.totalAfter + prodResult.totalAfter;
  console.log(`\n=== CONVERTED ${dailyResult.count + prodResult.count} IMAGES ===`);
  console.log(`Original: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → WebP: ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller) ===`);
})();
