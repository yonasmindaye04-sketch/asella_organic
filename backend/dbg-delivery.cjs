const mysql = require("mysql2/promise");
require("dotenv").config({ path: "C:\\Users\\MrYoYo\\Desktop\\project\\asella_organic\\backend\\.env" });

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, port: parseInt(process.env.DB_PORT || "3306", 10),
  });

  console.log("--- delivery staff rows ---");
  const [d] = await c.query(
    `SELECT id, full_name, username, role, telegram_username FROM staff_users WHERE role='delivery' AND deleted_at IS NULL`
  );
  console.log(d);

  console.log("--- distinct orders.assigned_to ---");
  const [a] = await c.query(
    `SELECT assigned_to, COUNT(*) n, SUM(status='Delivered') del FROM orders WHERE assigned_to IS NOT NULL GROUP BY assigned_to`
  );
  console.log(a);

  console.log("--- all staff roster by role ---");
  const [r] = await c.query(
    `SELECT role, COUNT(*) n FROM staff_users WHERE deleted_at IS NULL GROUP BY role`
  );
  console.log(r);

  console.log("--- delivery_rejections count ---");
  try {
    const [rej] = await c.query(`SELECT driver_username, COUNT(*) n FROM delivery_rejections GROUP BY driver_username`);
    console.log(rej);
  } catch (e) { console.log("no table:", e.message); }

  await c.end();
})();
