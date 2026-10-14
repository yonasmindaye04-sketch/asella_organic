/**
 * src/config/db.ts
 * Asella Organic — MySQL Pool Configuration
 */
import mysql from 'mysql2/promise';
import "dotenv/config";

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
  // Pin the collation to the database default.
  //
  // mysql2 connects with utf8mb4_general_ci when this is unset, while the
  // database and its views are utf8mb4_unicode_ci. Comparing a string
  // literal against a column carrying a different collation is not an
  // error MySQL coerces its way out of — it raises
  //   ERROR 1267 Illegal mix of collations (utf8mb4_general_ci,COERCIBLE)
  //          and (utf8mb4_unicode_ci,COERCIBLE) for operation '='
  // which surfaced as a 500 on GET /api/customers?segment=... The
  // segment column is a CASE expression inside vw_customer_insights, so it
  // took the database default at CREATE VIEW time.
  //
  // unicode_ci is the right side of the pair: the older tables are
  // utf8mb3_unicode_ci, and utf8mb3 and utf8mb4 share that collation.
  charset: 'utf8mb4_unicode_ci',
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