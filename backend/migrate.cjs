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

// ── Strip numbered comment lines like "1.-- MORINGA seed" ─────────
// These appear inside INSERT ... VALUES blocks in some migration files
// and break SQL syntax if left in place.
function stripNumberedComments(sql) {
  return sql.split("\n")
    .filter(line => !/^\s*\d+\.?\s*--/.test(line))
    .join("\n");
}

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

  // `APPLY-*.sql` is a consolidated bundle for applying 021–033 by hand through
  // phpMyAdmin, where running them one file at a time is impractical. It is not
  // a migration in its own right: it re-runs the very same statements as
  // 021…033, so letting this runner pick it up makes every database fail with
  // "Duplicate column name" the moment the individual files have been applied.
  // Excluded here; it stays on disk for the manual phpMyAdmin workflow.
  const scanFiles      = files.filter(f => !f.startsWith("APPLY-"));

  const [appliedRows]  = await connection.query("SELECT filename FROM migrations_log");
  const appliedFiles   = new Set(appliedRows.map(r => r.filename));

  const pendingFiles   = scanFiles.filter(f => !appliedFiles.has(f));

  const args = process.argv.slice(2);
  const isProduction = process.env.NODE_ENV === "production";
  const allowDangerous = args.includes("--allow-dangerous");
  const isYes = args.includes("--yes");
  const isReset = args.includes("--reset");

  // Fixtures and data-repair scripts, not schema changes. Declared at function
  // scope because the blocked-set below is built from it too.
  //
  // `seed` / `dummy` cover the bulk fixtures (004_dummy_data, 027-030).
  // `verify_seed` and `rebuild_inventory` name their own risk: 032 aborts the
  // run on invariants that only hold for the fixture dataset, and 031 deletes
  // and rebuilds inventory_movements from scratch.
  //
  // `repair` is here for the same reason and is NOT a stylistic addition.
  // 026_repair_catalog.sql looked safe because it has no DROP/DELETE and no
  // unguarded mass UPDATE, but it rewrites production money data:
  //   :219  products.unit_cost      <- price * 0.55 for every zero-cost product
  //   :222  order_items.unit_cost   <- overwrites the historical COGS snapshot
  //   :234  orders.total            <- recomputed from line items
  //   :243+ historical unit_price   <- rewritten where the export smeared them
  //   :169-210 stock levels        <- hardcoded for the 31 seeded SKUs
  // Those rewrites are correct against the legacy export this file was
  // written for and wrong against a live database, so the file has to be
  // opted into explicitly like any other fixture.
  const DANGEROUS_MIGRATION = /seed|dummy|verify_seed|rebuild_inventory|repair/i;

  // SKIP dangerous files in ALL modes (not just production) — they rewrite
  // real money/stock data and must never run on a curated database.
  const dangerousFiles = pendingFiles.filter(f => DANGEROUS_MIGRATION.test(f));
  const safeFiles       = pendingFiles.filter(f => !DANGEROUS_MIGRATION.test(f));

  if (dangerousFiles.length > 0 && !allowDangerous) {
    console.warn("\n=== SKIPPING DANGEROUS MIGRATIONS ===");
    dangerousFiles.forEach(f => console.warn(`  skipped: ${f}`));
    console.warn(
      "These are demo fixtures or legacy-data repairs. They are correct\n" +
      "against a seeded dataset and destructive against real orders, so\n" +
      "they are not recorded as applied and will be skipped again on every\n" +
      "run. Pass --allow-dangerous only if that is genuinely what you want.\n"
    );
    if (safeFiles.length === 0) {
      console.error("No safe migrations pending — nothing to do.");
      process.exit(0);
    }
    console.warn(`Continuing with ${safeFiles.length} safe migration(s).\n`);
  }

  if (isProduction) {
    if (isReset && !allowDangerous) {
      console.error("Refusing --reset in production without --allow-dangerous");
      process.exit(1);
    }

    if (pendingFiles.length > 0 && !isYes) {
      console.log("Pending migrations:");
      pendingFiles.forEach(f => console.log("  " + f));
      console.error("Production requires --yes to apply pending migrations.");
      process.exit(1);
    }
  }

  // Files to deliberately not run this pass — dangerous migrations are
  // blocked in ALL modes, not just production.
  const blockedFiles = new Set(dangerousFiles);

  // Iterate scanFiles, not files — otherwise the APPLY-* bundle that was
  // filtered out above is still executed, because the appliedFiles check only
  // skips migrations this runner recorded itself.
  for (const file of scanFiles) {
    if (appliedFiles.has(file)) {
      console.log(`Skipping (already applied): ${file}`);
      continue;
    }

    if (blockedFiles.has(file)) {
      console.log(`Skipping (blocked): ${file}`);
      continue;
    }

    console.log(`Applying: ${file} ...`);
    const raw        = fs.readFileSync(path.join(sqlDir, file), "utf8");
    const cleaned    = stripDelimiters(stripNumberedComments(raw));
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
