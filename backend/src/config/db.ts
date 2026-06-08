/**
 * src/config/db.ts
 * Asella Organic — MySQL Pool Configuration
 */
import mysql from 'mysql2/promise';

dotenv.config();

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  throw new Error(
    "[db] Database environment variables are not set. Add them to .env and Yegara Host cPanel env vars."
  );
}

// Create the connection pool mapping to MySQL configurations
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'asella_organic',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 5000
});

export const testConnection = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the MySQL database server.');
    connection.release();
  } catch (error) {
    console.error('Failed to establish connection with MySQL pool:', error);
    process.exit(1);
  }
};

export default pool;