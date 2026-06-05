/**
 * migrate.cjs
 * Asella Organic — Database Migration Runner (MySQL / MariaDB)
 *
 * - Reads .sql files from db/sql/ in alphabetical order
 * - Skips files already recorded in migrations_log
 * - Strips DELIMITER directives (not supported by mysql2 driver)
 * - Splits files into individual statements, respecting BEGIN...END blocks
 * - Runs statements one-by-one so CREATE TRIGGER works correctly
 * - Skips transaction wrapping for DDL files (CREATE TRIGGER causes
 *   implicit commit in MariaDB, which would break the rollback)
 */

const fs   = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

// ── Strip DELIMITER $$ ... DELIMITER ; blocks ─────────────────────
function stripDelimiters(sql) {
  const lines  = sql.split("\n");
  const output = [];
  let customDelim = null;

  for (const line of lines) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed.startsWith("DELIMITER")) {
      const parts   = line.trim().split(/\s+/);
      const newDelim = parts[1];
      customDelim    = newDelim === ";" ? null : newDelim;
      continue; // never emit DELIMITER lines
    }
    if (customDelim) {
      output.push(line.replace(new RegExp(customDelim.replace(/\$/g, "\\$"), "g"), ";"));
    } else {
      output.push(line);
    }
  }
  return output.join("\n");
}

// ── Split into individual statements, respecting BEGIN...END ──────
function splitStatements(sql) {
  const statements = [];
  let   current    = "";
  let   depth      = 0;

  for (const line of sql.split("\n")) {
    const upper = line.trim().toUpperCase();
    if (/^BEGIN\b/.test(upper))                          depth++;
    if (/^END(\s*;)?\s*$/.test(upper) && depth > 0)     depth--;

    current += line + "\n";

    if (depth === 0 && line.trim().endsWith(";")) {
      const stmt = current.trim();
      if (stmt && stmt !== ";") statements.push(stmt);
      current = "";
    }
  }
  const remainder = current.trim();
  if (remainder && remainder !== ";") statements.push(remainder);
  return statements;
}

// ── Detect whether a file contains DDL that causes implicit commits ─
// CREATE TRIGGER / CREATE PROCEDURE / DROP TRIGGER cause implicit
// commits in MariaDB; wrapping them in BEGIN/ROLLBACK is pointless.
function hasDDL(sql) {
  const upper = sql.toUpperCase();
  return (
    upper.includes("CREATE TRIGGER")   ||
    upper.includes("DROP TRIGGER")     ||
    upper.includes("CREATE PROCEDURE") ||
    upper.includes("DROP PROCEDURE")   ||
    upper.includes("CREATE OR REPLACE VIEW") ||
    upper.includes("CREATE VIEW")
  );
}

// ── Main ──────────────────────────────────────────────────────────
async function runMigrations() {
  const connection = await mysql.createConnection({
    host:               process.env.DB_HOST     || "127.0.0.1",
    user:               process.env.DB_USER,
    password:           process.env.DB_PASSWORD,
    database:           process.env.DB_NAME,
    port:               parseInt(process.env.DB_PORT || "3306", 10),
    multipleStatements: false,
  });

  console.log("Connected to MySQL database.");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      run_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const sqlDir = path.join(__dirname, "db", "sql");
  if (!fs.existsSync(sqlDir)) {
    console.error("Migration directory not found:", sqlDir);
    await connection.end();
    process.exit(1);
  }

  const files          = fs.readdirSync(sqlDir).filter(f => f.endsWith(".sql")).sort();
  const [appliedRows]  = await connection.query("SELECT filename FROM migrations_log");
  const appliedFiles   = new Set(appliedRows.map(r => r.filename));

  for (const file of files) {
    if (appliedFiles.has(file)) {
      console.log(`Skipping (already applied): ${file}`);
      continue;
    }

    console.log(`Applying: ${file} ...`);
    const raw        = fs.readFileSync(path.join(sqlDir, file), "utf8");
    const cleaned    = stripDelimiters(raw);
    const statements = splitStatements(cleaned).filter(s => {
      const stripped = s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      return stripped.length > 0 && stripped !== ";";
    });

    const useDDLMode = hasDDL(cleaned);

    if (!useDDLMode) {
      await connection.beginTransaction();
    }

    try {
      for (const stmt of statements) {
        await connection.query(stmt);
      }
      await connection.execute(
        "INSERT IGNORE INTO migrations_log (filename) VALUES (?)", [file]
      );
      if (!useDDLMode) {
        await connection.commit();
      }
      console.log(`✓ ${file}`);
    } catch (err) {
      if (!useDDLMode) {
        await connection.rollback();
      }
      console.error(`✗ Migration failed: ${file}`);
      console.error(err.message ?? err);
      await connection.end();
      process.exit(1);
    }
  }

  console.log("\nAll migrations applied successfully.");
  await connection.end();
}

runMigrations().catch(err => {
  console.error("Migration aborted:", err);
  process.exit(1);
});
