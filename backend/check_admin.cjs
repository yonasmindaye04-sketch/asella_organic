const mysql = require("mysql2/promise");
require("dotenv").config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "asellafs_organic",
  });
  const [rows] = await conn.query(
    "SELECT id, username, full_name, role FROM staff_users WHERE role='admin' AND deleted_at IS NULL LIMIT 5"
  );
  console.table(rows);
  await conn.end();
})();
