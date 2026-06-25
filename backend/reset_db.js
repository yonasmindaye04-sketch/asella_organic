import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function reset() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || "3306", 10),
  });

  const [tables] = await connection.query('SHOW TABLES');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    const tableName = Object.values(table)[0];
    console.log(`Dropping table ${tableName}`);
    await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Database reset complete.');
  await connection.end();
}

reset().catch(console.error);
