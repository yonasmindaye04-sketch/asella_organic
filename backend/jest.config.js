/**
 * backend/jest.config.js
 * Asella Organic — Jest Test Configuration
 */

const config = {
  preset:              "ts-jest/presets/default-esm",
  testEnvironment:     "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      useESM: true,
      tsconfig: "./tsconfig.test.json",
    }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  transformIgnorePatterns: [
    "/node_modules/(?!(@exodus|encoding-lite|html-encoding-sniffer|jsdom)/)",
  ],

  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
    "<rootDir>/tests/**/*.spec.ts",
  ],

  collectCoverage:     true,
  coverageDirectory:   "coverage",
  coverageReporters:   ["text", "lcov", "html"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/config/env.ts",
    "!src/server.ts",
  ],

  // Thresholds set to current baseline — raise incrementally as tests improve
  coverageThreshold: {
    global: {
      branches:   41,
      functions:  51,
      lines:      43,
      statements: 43,
    },
  },

  testTimeout:       30_000,
  maxWorkers:        1,
  forceExit:         true,
  detectOpenHandles: true,

  globalSetup:    "<rootDir>/tests/setup/globalSetup.ts",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.ts",

  verbose: true,

  testEnvironmentOptions: {
    env: {
      NODE_ENV: "test",
    },
  },
};

export default config;