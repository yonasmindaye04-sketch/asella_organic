const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({host: 'localhost', user: 'root', password: '', database: 'asella_organic'});
  const [rows] = await c.query('SHOW COLUMNS FROM staff_users LIKE "role"');
  console.log(rows);
  await c.end();
})();
