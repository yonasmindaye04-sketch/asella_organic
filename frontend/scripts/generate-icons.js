import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const input = path.resolve('public/favicon.png');
const outDir = path.resolve('public/icons');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generate() {
  await sharp(input).resize(192, 192).toFile(path.join(outDir, 'icon-192.png'));
  await sharp(input).resize(512, 512).toFile(path.join(outDir, 'icon-512.png'));
  // For maskable, just add padding for now, or just resize if favicon is suitable
  await sharp(input).resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).toFile(path.join(outDir, 'icon-512-maskable.png'));
}

generate().catch(console.error);
