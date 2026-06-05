/**
 * backend/tests/setup/globalTeardown.ts
 */
export default async function globalTeardown() {
  // Pool is closed inside each test file's afterAll — nothing extra needed here
  console.log("\n✓ Test suite complete\n");
}