/**
 * backend/tests/unit/utils.test.ts
 * Asella Organic — Utils Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { qs, qsInt } from "../../src/lib/utils.js";

describe("Utils (qs, qsInt)", () => {
  describe("qs", () => {
    it("returns null for undefined or null", () => {
      expect(qs(undefined)).toBeNull();
      expect(qs(null)).toBeNull();
    });

    it("returns string as-is", () => {
      expect(qs("test_string")).toBe("test_string");
    });

    it("returns first element if passed an array of strings", () => {
      expect(qs(["first", "second"])).toBe("first");
    });

    it("returns null for non-string array elements", () => {
      expect(qs([{} as any, "second"])).toBeNull();
    });

    it("returns null for objects (ParsedQs)", () => {
      expect(qs({ nested: "value" } as any)).toBeNull();
    });
  });

  describe("qsInt", () => {
    it("returns parsed integer for a valid numeric string", () => {
      expect(qsInt("42", 10)).toBe(42);
    });

    it("returns default value for invalid string", () => {
      expect(qsInt("not-a-number", 10)).toBe(10);
    });

    it("returns default value for empty or undefined", () => {
      expect(qsInt(undefined, 5)).toBe(5);
      expect(qsInt(null, 5)).toBe(5);
    });
  });
});
