/**
 * backend/tests/setup/envGuard.cjs
 *
 * Pre-loads a valid JWT_SECRET into process.env BEFORE the test files
 * import src/config/env.js. Without this, the boot-time fatal-exit check
 * added for ASE-2026-003 (removal of the published JWT signing default)
 * would kill the entire test run as soon as it imports env.js.
 *
 * The guard is intentionally permissive in test (NODE_ENV=test):
 *   • Sets JWT_SECRET to a 32-char placeholder if not already set.
 *   • Leaves JWT_SECRET_PREVIOUS alone so tests can opt into rotation
 *     scenarios themselves.
 *
 * Note: the boot guard is exercised for real in
 * tests/unit/env-boot-guard.test.ts, which spawns a child process rather
 * than importing env.js in-process — importing it here would exit(78)
 * the Jest worker.
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test-jwt-secret-needs-32-chars-or-more!!";
}
