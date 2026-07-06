const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', 
    user: 'root', 
    password: '', 
    database: 'asella_organic'
  });
  await c.query("ALTER TABLE staff_users MODIFY COLUMN role ENUM('admin','manager','employee','affiliate','delivery','vendor','driver') NOT NULL");
  await c.query("UPDATE staff_users SET role='driver' WHERE role=''");
  console.log('Database updated successfully');
  await c.end();
})();
