const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || '127.0.0.1',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     parseInt(process.env.DB_PORT || '3306', 10),
  });

  // Fix case mismatch: 'himalaya...' → 'Himalaya...' for the 120 tablet
  const [r1] = await conn.query(
    `UPDATE products SET image_url = '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png'
     WHERE name LIKE '%Ashewagenda%' AND package_size LIKE '%120%'`
  );
  console.log(`120 Tablet: ${r1.affectedRows} row(s) updated`);

  // Also fix the 60 tablet to make sure it's correct
  const [r2] = await conn.query(
    `UPDATE products SET image_url = '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png'
     WHERE name LIKE '%Ashewagenda%' AND package_size LIKE '%60%'`
  );
  console.log(`60 Tablet: ${r2.affectedRows} row(s) updated`);

  // Verify
  const [rows] = await conn.query(
    `SELECT name, package_size, image_url FROM products WHERE name LIKE '%Ashewagenda%'`
  );
  console.log('\nVerification:');
  console.table(rows);
  await conn.end();
  console.log('Done!');
})().catch(e => { console.error(e.message); process.exit(1); });
