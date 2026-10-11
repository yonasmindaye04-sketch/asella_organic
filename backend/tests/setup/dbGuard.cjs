const { URL } = require("url");

let host = "localhost";
let dbName = "asella_organic";

if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    host = url.hostname;
    dbName = url.pathname.replace(/^\//, '');
  } catch (e) {}
} else if (process.env.DB_HOST) {
  host = process.env.DB_HOST;
  dbName = process.env.DB_NAME || "asella_organic";
}

if (
  host !== "localhost" && 
  host !== "127.0.0.1" && 
  process.env.ALLOW_REMOTE_TEST_DB !== "1"
) {
  console.error(`\n✗ Aborting test run: safety guard triggered.\n  Test database host must be localhost or 127.0.0.1.\n  Found host: ${host}, database: ${dbName}\n  To bypass, set ALLOW_REMOTE_TEST_DB=1.\n`);
  process.exit(1);
}

console.log(`${host} ${dbName}`);
