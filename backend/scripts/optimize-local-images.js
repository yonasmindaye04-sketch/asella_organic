import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_IMAGES_DIR = path.resolve('../frontend/public/image/products');

async function optimizeImages() {
  const files = fs.readdirSync(PUBLIC_IMAGES_DIR);
  
  for (const file of files) {
    if (!file.match(/\.(png|jpg|jpeg)$/i)) continue;
    
    const filePath = path.join(PUBLIC_IMAGES_DIR, file);
    const stat = fs.statSync(filePath);
    
    // If larger than 300KB, compress it
    if (stat.size > 300 * 1024) {
      console.log(`Compressing ${file} (${Math.round(stat.size / 1024)}KB)`);
      const tempPath = filePath + '.tmp';
      
      try {
        const ext = path.extname(file).toLowerCase();
        let pipeline = sharp(filePath).resize(800, 800, { fit: 'inside', withoutEnlargement: true });
        
        if (ext === '.png') pipeline = pipeline.png({ quality: 80, compressionLevel: 9 });
        else pipeline = pipeline.jpeg({ quality: 80 });
        
        await pipeline.toFile(tempPath);
          
        fs.renameSync(tempPath, filePath);
        console.log(` -> Optimized to ${Math.round(fs.statSync(filePath).size / 1024)}KB`);
      } catch (err) {
        console.error(`Failed to optimize ${file}:`, err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
  }
}

optimizeImages();
