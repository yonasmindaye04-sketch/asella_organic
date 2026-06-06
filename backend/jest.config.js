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
      tsconfig: {
        module: "Node16",
        moduleResolution: "node16",
        target: "esnext",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        verbatimModuleSyntax: false,
        types: ["jest", "node"],
        noUncheckedIndexedAccess: false,
        exactOptionalPropertyTypes: false,
      }
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
  coverageThreshold: {
    global: {
      branches:   70,
      functions:  75,
      lines:      75,
      statements: 75,
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