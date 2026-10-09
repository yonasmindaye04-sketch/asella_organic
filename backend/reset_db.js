import mysql from 'mysql2/promise';
import 'dotenv/config';

async function resetDB() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306', 10),
  });

  const dbName = process.env.DB_NAME || 'asella_organic';
  
  console.log(`Dropping and recreating database: ${dbName}...`);
  await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await connection.query(`CREATE DATABASE \`${dbName}\``);
  
  console.log("Done.");
  await connection.end();
}

resetDB().catch(console.error);
