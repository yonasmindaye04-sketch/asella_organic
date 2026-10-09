/**
 * backend/jest.nodb.config.js
 *
 * Same as jest.config.js but without the MySQL globalSetup, so pure unit
 * tests (no database) can run on a machine with no local MySQL — CI, a
 * laptop mid-task, a container.
 *
 * The default config's globalSetup fails the whole run when DB_PASSWORD is
 * unset, which blocks even tests that never touch the database.
 *
 * Usage:
 *   node --experimental-vm-modules ./node_modules/jest/bin/jest.js \
 *     tests/unit --config jest.nodb.config.js
 *
 * Never use this for tests/integration — those need the real schema.
 */

import base from "./jest.config.js";

export default {
  ...base,
  globalSetup: undefined,
  globalTeardown: undefined,
  collectCoverage: false,
  coverageThreshold: undefined,
};