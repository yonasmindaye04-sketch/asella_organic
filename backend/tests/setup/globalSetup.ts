/**
 * backend/tests/setup/globalSetup.ts
 * Creates a separate test database schema before the test suite runs.
 */

import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * Read a required env var or fail fast with a clear message.
 * Used for the DB credentials that the test runner can't operate without.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `\n✗ Missing required env var ${name} for the test database.\n` +
      `  Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in backend/.env or your shell.\n`
    );
  }
  return value;
}

export default async function globalSetup() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "127.0.0.1",
    user:     requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
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