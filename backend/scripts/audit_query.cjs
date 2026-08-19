require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'asella_organic',
    port: parseInt(process.env.DB_PORT || '3306', 10),
  });

  try {
    const [rows] = await pool.query(`
      SELECT name, COUNT(*) as variant_count, GROUP_CONCAT(package_size) as sizes
      FROM products 
      WHERE active = 1 
      GROUP BY name 
      ORDER BY variant_count DESC
    `);
    console.table(rows);
  } catch (error) {
    console.error('Error connecting to db:', error);
  } finally {
    await pool.end();
  }
}

run();
