import config from "./jest.config.js";

const noDbConfig = {
  ...config,
  globalSetup: undefined,
  globalTeardown: undefined,
  testMatch: [
    "<rootDir>/tests/unit/app.test.ts",
    "<rootDir>/tests/unit/products-mocked.test.ts"
  ]
};

export default noDbConfig;
