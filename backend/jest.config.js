/**
 * backend/jest.config.ts
 * Asella Organic — Jest Test Configuration
 */

const config = {
  preset:              "ts-jest/presets/default-esm",
  testEnvironment:     "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // Test file locations
  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
    "<rootDir>/tests/**/*.spec.ts",
  ],

  // Coverage
  collectCoverage:     true,
  coverageDirectory:   "coverage",
  coverageReporters:   ["text", "lcov", "html"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/config/env.ts",
    "!src/server.ts",
  ],
  coverageThreshold: {
    global: {
      branches:  70,
      functions: 75,
      lines:     75,
      statements: 75,
    },
  },

  // Execution
  testTimeout:   30_000,   // 30s for integration tests with real DB
  maxWorkers:    1,        // Single worker to avoid DB race conditions
  forceExit:     true,
  detectOpenHandles: true,

  // Setup
  globalSetup:    "<rootDir>/tests/setup/globalSetup.ts",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.ts",

  // Verbose output
  verbose: true,

  // Environment variables for tests
  testEnvironmentOptions: {
    env: {
      NODE_ENV: "test",
    },
  },
};

export default config;
