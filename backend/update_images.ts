import pool from './src/config/db';

const imageMap: Record<string, string> = {
  'Moringa Seed': '/image/products/Moringa 200g,500g and 1kg.png',
  'Moringa Powder': '/image/products/Moringa 200g,500g and 1kg.png',
  'Ashewagenda powder': '/image/products/Ashwegdna Powder 250g.png',
  'Ashewagenda (Himalya) Tablet': '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png', // Default, we'll override 120 later if needed
  'Shilajit Gummies': '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png',
  'Shilajit Tablet': '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png',
  'Shilajit Oil': '/image/products/Neuherb Shilajit gel 20g.png',
  'Chia Seed': '/image/products/Chiaseed 250g and 1kg.png',
  'Kerbe Powder': '/image/products/Kerbe Powder ( 100g ).png',
  'Asella Kerbe Raw': '/image/products/Kerbe Powder ( 100g ).png',
  'Kerkede Leafe': '/image/products/Hibiscus ( 100g ).png',
  'Chebe Powder': '/image/products/Chebe powder  ( 100g ).png',
  'Erde': '/image/products/Erid Turmeric ( 220g ).png',
  'Coffee': '/image/products/Moringa 200g,500g and 1kg.png', // Fallback
  'Kesil Powder': '/image/products/Qasil Powder ( 200g ).png',
  'Kerebe (Myrrh) Oil': '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png',
  'Frankincense Oil': '/image/products/Frankincense Oil  30ml and 60 ml.jpeg',
  'Cloves': '/image/products/Asella Cloves 100g.png',
  'Pumpkin Seed': '/image/products/Pumpkin Seed  100g.jpeg',
  'Blackseed Oil': '/image/products/Blackseed Oil ( 30ml ).JPG',
  'Nila powder': '/image/products/Nila Powder 100g.jpeg',
  'Asella Frankincense Raw': '/image/products/Asella Frankincense ( 100g ).jpeg',
  'Cinnamon': '/image/products/Moringa 200g,500g and 1kg.png', // Fallback
  'Turmeric Powder': '/image/products/Erid Turmeric ( 220g ).png',
  'Ginger Powder': '/image/products/Erid Turmeric ( 220g ).png', // Fallback
  'Spirulina Powder': '/image/products/Moringa 200g,500g and 1kg.png', // Fallback
  'Moringa Capsules': '/image/products/Moringa 200g,500g and 1kg.png'
};

async function run() {
  for (const [name, imgUrl] of Object.entries(imageMap)) {
    await pool.query('UPDATE products SET image_url = ? WHERE name LIKE ?', [imgUrl, `%${name}%`]);
  }
  
  // Specific size overrides
  await pool.query('UPDATE products SET image_url = ? WHERE name = ? AND package_size LIKE ?', 
    ['/image/products/himalaya ashwagandha tablet 120 ( 250 mg ).png', 'Ashewagenda (Himalya) Tablet', '%120%']
  );
  
  console.log('Images updated successfully');
  process.exit(0);
}

run();
