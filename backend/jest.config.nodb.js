import config from "./jest.config.js";

const noDbConfig = {
  ...config,
  globalSetup: undefined,
  globalTeardown: undefined,
  testMatch: [
    "<rootDir>/tests/unit/app.test.ts"
  ]
};

export default noDbConfig;
