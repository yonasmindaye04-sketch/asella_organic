/**
 * backend/jest.config.js
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

  // Allow Jest to transform ESM-only packages that would otherwise break
  transformIgnorePatterns: [
    "/node_modules/(?!(@exodus|encoding-lite|html-encoding-sniffer|jsdom)/)",
  ],

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
      branches:   70,
      functions:  75,
      lines:      75,
      statements: 75,
    },
  },

  // Execution
  testTimeout:       30_000,
  maxWorkers:        1,
  forceExit:         true,
  detectOpenHandles: true,

  // Setup
  globalSetup:    "<rootDir>/tests/setup/globalSetup.ts",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.ts",

  // Verbose output
  verbose: true,

  testEnvironmentOptions: {
    env: {
      NODE_ENV: "test",
    },
  },
};

export default config;
