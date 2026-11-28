/**
 * backend/jest.integration.config.js
 *
 * Same as jest.config.js but with the coverage floor of the integration
 * suite alone.
 *
 * The thresholds in jest.config.js are the baseline of the whole test
 * suite - unit and integration tests together. CI runs the two halves
 * separately: the unit half with jest.nodb.config.js (no database
 * needed) and the integration half with this config, against a database
 * that only holds what the migrations create. The integration half on
 * its own covers about 28% of the statements and 19% of the branches, so
 * the whole-suite floor could never be met by it and jest exited 1 after
 * every test had passed:
 *
 *     Jest: "global" coverage threshold for branches (38%) not met: 19.18%
 *
 * The numbers below are what the integration suite actually achieves
 * against a freshly migrated database, with a little room below them.
 * The stricter floor for the suite as a whole stays in jest.config.js.
 */

import base from "./jest.config.js";

export default {
  ...base,
  coverageThreshold: {
    global: {
      statements: 26,  // actual: 28.26%
      branches:   17,  // actual: 19.18%
      functions:  26,  // actual: 28.34%
      lines:      27,  // actual: 29.24%
    },
  },
};
