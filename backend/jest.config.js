/**
 * backend/jest.config.js
 * Asella Organic — Jest Test Configuration
 */

const config = {
  preset:              "ts-jest/presets/default-esm",
  testEnvironment:     "node",
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    // Match TS (.ts/.tsx), JS (.js/.jsx), and our ESM mock (.mjs) so we
    // can transform ESM-only .js files shipped by packages like
    // @scure/base, otplib, uuid, etc. that live under node_modules.
    "^.+\\.(t|j|m)sx?$": ["ts-jest", {
      useESM: true,
      tsconfig: "./tsconfig.test.json",
    }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Stub isomorphic-dompurify so we don't pull in the jsdom + parse5
    // + @asamuzakjp/css-color ESM chain during unit tests. Integration
    // tests bypass this via testPathPatterns/integration.
    "^isomorphic-dompurify$": "<rootDir>/tests/setup/isomorphic-dompurify-mock.mjs",
  },

  transformIgnorePatterns: [
    // Allow ts-jest to transform ESM-only packages that ship as .js with
    // `export` statements. Without this, Jest's CommonJS loader hits a
    // `SyntaxError: Unexpected token 'export'` when our code imports
    // packages like otplib → @otplib/plugin-base32-scure → @scure/base.
    //
    // Add a package here only if a test file fails to parse it.
    "/node_modules/(?!(" +
      [
        "@exodus",
        "encoding-lite",
        "html-encoding-sniffer",
        "jsdom",
        // ESM-only deps that otplib pulls in:
        "@scure",
        "@noble",
        "@otplib",
        "otplib",
        // ESM-only utility deps:
        "uuid",
        "cookie",
        "supertest",
        // ESM-only deps that isomorphic-dompurify → jsdom pulls in:
        "isomorphic-dompurify",
        "dompurify",
        "parse5",
        "entities",
        // Confirmed ESM (have "type": "module" in their package.json):
        "zod",
        "lru-cache",
      ].join("|") +
    ")/)",
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
    // The src/__tests__/ directory holds a placeholder test that's
    // not picked up by testMatch. Exclude it from coverage measurement
    // so it doesn't drag the line-coverage percentage down.
    "!src/__tests__/**",
    // Scripts are CLI entry points, not exercised by the test suite.
    "!src/scripts/**",
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