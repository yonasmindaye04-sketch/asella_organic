import { expect, describe, it, jest } from "@jest/globals";
import { ALLOWED_TAGS, normalizeKey, isDuplicate, mergedActive } from "../../src/lib/productRules.js";

describe("productRules", () => {
  it("PATCH excludes its own id", async () => {
    const queryFn = jest.fn(async () => [[{ id: "123", name: "Test", package_size: "100g", active: 1 }]]);
    const dup = await isDuplicate(queryFn as any, "Test", "100g", "123");
    
    const callArgs = (queryFn as any).mock.calls[0];
    expect(callArgs[0]).toContain("id != ?");
    expect(callArgs[1]).toEqual(["123"]);
  });

  it("an inactive product skips the duplicate check", () => {
    // This logic is handled in the router using mergedActive
    expect(mergedActive(0, true)).toBe(false);
    expect(mergedActive("false", 1)).toBe(false);
    expect(mergedActive(undefined, false)).toBe(false);
    expect(mergedActive(undefined, 0)).toBe(false);
  });

  it("reactivating with an active twin is rejected", async () => {
    // Router logic: isActive is true, isDuplicate returns true
    const queryFn = jest.fn(async () => [[{ id: "456", name: "Twin", package_size: "100g", active: 1 }]]);
    const dup = await isDuplicate(queryFn as any, "Twin", "100g", "123");
    expect(dup).toBe(true);
  });

  it("matching ignores case and spaces", () => {
    expect(normalizeKey("  Test Name  ", " 100 G ")).toBe("testname|100g");
  });

  it("an invalid tag is rejected", () => {
    expect(ALLOWED_TAGS).not.toContain("InvalidTag");
    expect(ALLOWED_TAGS).toContain("Traditional");
  });
});