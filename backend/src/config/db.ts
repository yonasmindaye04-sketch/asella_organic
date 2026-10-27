/**
 * src/config/db.ts
 * Asella Organic — MySQL Pool Configuration with In-Memory Preview Fallback
 */
import mysql from 'mysql2/promise';
import "dotenv/config";
import { executeMockQuery } from "./mockDb.js";

const hasExplicitDbConfig = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);
let useMockDb = !hasExplicitDbConfig || process.env.USE_MOCK_DB === "true";

const realPool = hasExplicitDbConfig
  ? mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'asella_organic',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      charset: 'utf8mb4_unicode_ci',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 3000,
    })
  : null;

function isConnectionError(err: any): boolean {
  const code = err?.code || "";
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ER_ACCESS_DENIED_ERROR" ||
    code === "ER_BAD_DB_ERROR"
  );
}

async function runQuery(sql: string, values?: any): Promise<[any, any]> {
  const params = Array.isArray(values) ? values : values !== undefined ? [values] : [];
  if (useMockDb || !realPool) {
    return executeMockQuery(sql, params);
  }
  try {
    return (await realPool.query(sql, params)) as [any, any];
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn("[db] MySQL connection unavailable, switching to in-memory Asella Organic mock database.");
      useMockDb = true;
      return executeMockQuery(sql, params);
    }
    throw err;
  }
}

const mockConnection = {
  query: (sql: string, values?: any) => runQuery(sql, values),
  execute: (sql: string, values?: any) => runQuery(sql, values),
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {},
};

const pool = {
  query: (sql: string, values?: any) => runQuery(sql, values),
  execute: (sql: string, values?: any) => runQuery(sql, values),
  getConnection: async () => {
    if (useMockDb || !realPool) {
      return mockConnection as any;
    }
    try {
      const conn = await realPool.getConnection();
      return conn;
    } catch (err) {
      if (isConnectionError(err)) {
        console.warn("[db] MySQL connection unavailable, switching to in-memory Asella Organic mock database.");
        useMockDb = true;
        return mockConnection as any;
      }
      throw err;
    }
  },
  end: async () => {
    if (realPool && !useMockDb) {
      await realPool.end().catch(() => {});
    }
  },
};

export const testConnection = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    console.log(
      useMockDb
        ? 'Using in-memory Asella Organic mock database.'
        : 'Successfully connected to the MySQL database server.'
    );
    connection.release();
  } catch (error) {
    console.warn('MySQL connection failed, falling back to in-memory mock database:', error);
    useMockDb = true;
  }
};

export default pool as unknown as mysql.Pool;