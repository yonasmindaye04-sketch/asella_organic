const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  const hash = await bcrypt.hash("As181001@///", 10);

  const c = await mysql.createConnection({
    host: "127.0.0.1",
    user: "root",
    database: "asellafs_organic",
  });

  const [existing] = await c.query(
    "SELECT id FROM staff_users WHERE username = ?",
    ["AS_sup_admin"]
  );

  if (existing.length > 0) {
    await c.query(
      `UPDATE staff_users SET password_hash = ?, full_name = ?, role = 'superadmin', active = 1, updated_at = NOW() WHERE username = ?`,
      [hash, "Super Admin", "AS_sup_admin"]
    );
    console.log("Admin user AS_sup_admin updated");
  } else {
    await c.query(
      `INSERT INTO staff_users (id, username, password_hash, full_name, role, email, active, created_at, updated_at)
       VALUES (UUID(), ?, ?, 'Super Admin', 'superadmin', NULL, 1, NOW(), NOW())`,
      ["AS_sup_admin", hash, "Super Admin"]
    );
    console.log("Admin user AS_sup_admin created");
  }

  const [rows] = await c.query(
    "SELECT id, username, role, active FROM staff_users WHERE username = 'AS_sup_admin'"
  );
  console.log("Admin user:", JSON.stringify(rows[0], null, 2));

  await c.end();
})();
