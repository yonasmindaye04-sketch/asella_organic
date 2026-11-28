#!/usr/bin/env node
/**
 * security/scripts/seed-local-accounts.mjs
 *
 * Creates one test account per staff role in the LOCAL development database
 * so the authorization suite has something to log in with.
 *
 * This is a fixture tool, not part of the test suite. It uses the backend's
 * own dependencies (bcryptjs, mysql2, dotenv) and installs nothing new.
 *
 * It refuses to run against anything that is not a local database.
 *
 * Usage:
 *   node security/scripts/seed-local-accounts.mjs
 *   node security/scripts/seed-local-accounts.mjs --write-env
 *
 * --write-env appends the created credentials to security/.env so the suite
 * can use them immediately.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SECURITY_ROOT, REPO_ROOT } from "./lib/config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(REPO_ROOT, "backend");

const requireBackend = createRequire(path.join(BACKEND_ROOT, "package.json"));
const mysql = requireBackend("mysql2/promise");
const bcrypt = requireBackend("bcryptjs");
const dotenv = requireBackend("dotenv");

const ROLES = [
  "admin",
  "manager",
  "employee",
  "store_manager",
  "call_center",
  "delivery",
  "affiliate",
  "vendor",
  "tech_support",
];

const LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "0.0.0.0",
  "asella-mariadb",
  "mariadb",
  "mysql",
]);

const args = process.argv.slice(2);
const writeEnv = args.includes("--write-env");

dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });

const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 3306);
const database = process.env.DB_NAME || "asella_organic";
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD || "";

if (!LOCAL_HOSTS.has(String(host).toLowerCase())) {
  console.error(
    `\n[security] Refusing to seed accounts against a non-local database: ${host}\n` +
      "           This tool is for the local development database only.\n"
  );
  process.exit(3);
}

const sharedPassword =
  process.env.SECURITY_SEED_PASSWORD || "SecuritySuiteLocal1!";

console.log(`\n[security] Seeding role accounts in ${database} @ ${host}:${port}\n`);

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
});

const hash = await bcrypt.hash(sharedPassword, 12);
const created = [];

for (const role of ROLES) {
  const username = `sec_${role}`;
  const id = crypto.randomUUID();

  try {
    await connection.query(
      `INSERT INTO staff_users (id, username, password_hash, full_name, role, active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [id, username, hash, `Security Suite ${role}`, role]
    );
    created.push({ role, username, password: sharedPassword, action: "created", staffId: id });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      await connection.query(
        `UPDATE staff_users
            SET password_hash = ?, full_name = ?, role = ?, active = TRUE,
                deleted_at = NULL
          WHERE username = ?`,
        [hash, `Security Suite ${role}`, role, username]
      );
      const [existingRows] = await connection.query(
        "SELECT id FROM staff_users WHERE username = ?",
        [username]
      );
      created.push({
        role,
        username,
        password: sharedPassword,
        action: "reset",
        staffId: existingRows?.[0]?.id ?? null,
      });
    } else {
      console.error(`  ! ${role}: ${error.message}`);
    }
  }
}

// The affiliate portal applies a second guard: it needs a linked, active
// affiliate profile. Without this row the affiliate account is denied by
// /api/affiliate/* and that route cannot be exercised.
const affiliateAccount = created.find((a) => a.role === "affiliate");
if (affiliateAccount?.staffId) {
  try {
    await connection.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, referral_code, full_name, is_active)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         user_id   = VALUES(user_id),
         is_active = TRUE,
         full_name = VALUES(full_name)`,
      [
        crypto.randomUUID(),
        affiliateAccount.staffId,
        `SEC${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        "Security Suite Affiliate",
      ]
    );
    console.log("  linked affiliate_profiles row for sec_affiliate");
  } catch (error) {
    console.error(`  ! affiliate profile: ${error.message}`);
  }
}

await connection.end();

console.log("");
for (const account of created) {
  console.log(
    `  ${account.action.padEnd(6)} ${account.username.padEnd(18)} password: ${account.password}`
  );
}
console.log("");

if (writeEnv) {
  const envPath = path.join(SECURITY_ROOT, ".env");
  let existing = "";
  if (fs.existsSync(envPath)) {
    existing = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => !/^SECURITY_[A-Z_]+_(USER|PASS)=/.test(line))
      .join("\n");
  }

  const lines = created.map(
    (account) =>
      `SECURITY_${account.role.toUpperCase()}_USER=${account.username}\n` +
      `SECURITY_${account.role.toUpperCase()}_PASS=${account.password}`
  );

  fs.writeFileSync(envPath, `${existing.trimEnd()}\n\n${lines.join("\n")}\n`);
  console.log(`[security] Credentials written to ${envPath}\n`);
}

console.log(
  "[security] These accounts are local-only. Remove them before deploying:\n" +
    "          DELETE FROM staff_users WHERE username LIKE 'sec\\_%';\n"
);
