/*
 * Runs Jest with the flags this project's ESM test setup needs.
 *
 * The scripts used to call ./node_modules/jest/bin/jest.js directly, which
 * only works when jest happens to be installed inside backend/node_modules.
 * npm hoists it to the workspace root instead, so on a clean `npm ci` the
 * path does not exist and the run dies with
 *
 *     Error: Cannot find module '.../backend/node_modules/jest/bin/jest.js'
 *
 * Resolving jest's package.json instead of guessing a path works whether
 * the package was hoisted or not, and keeps the command the same on
 * Windows and on Linux - a shell substitution would not.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const jestDir = path.dirname(require.resolve("jest/package.json"));
const jestBin = path.join(jestDir, "bin", "jest.js");

const result = spawnSync(
  process.execPath,
  ["--experimental-vm-modules", jestBin, ...process.argv.slice(2)],
  { stdio: "inherit" }
);

process.exit(result.status === null ? 1 : result.status);
