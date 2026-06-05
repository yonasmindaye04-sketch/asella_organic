/**
 * backend/tests/setup/globalSetup.ts
 * Creates a separate test database schema before the test suite runs.
 */

import mysql from "mysql2/promise";
import "dotenv/config";

export default async function globalSetup() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "127.0.0.1",
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     parseInt(process.env.DB_PORT || "3306", 10),
  });

  // Verify connection works — tests will fail clearly if DB isn't running
  try {
    await conn.query("SELECT 1");
    console.log("\n✓ Test DB connection verified\n");
  } catch (err) {
    console.error("\n✗ Cannot connect to test database. Is MySQL running?\n");
    throw err;
  } finally {
    await conn.end();
  }
}