/**
 * backend/tests/unit/cloudinary-config.test.ts
 * Asella Organic — Cloudinary environment configuration tests
 *
 * Regression cover for a silent production failure: lib/cloudinary.ts used to
 * test `CLOUDINARY_URL || <triple>` but then call cloudinary.config() with only
 * the triple fields. Because the SDK merges via lodash `extend` (which copies
 * explicit `undefined`) and only parses CLOUDINARY_URL when config() is called
 * with no object, a CLOUDINARY_URL-only deployment ended up with
 * cloud_name: undefined — no warning at boot, and a 500 on the first upload.
 *
 * No database and no network: every case only inspects the configured client.
 */

import { jest } from "@jest/globals";
import type { Cloudinary } from "cloudinary";

const KEYS = [
  "CLOUDINARY_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

type Env = Record<(typeof KEYS)[number], string | undefined>;

/** Wipe the env, apply the case, re-evaluate lib/cloudinary.ts, read the client. */
async function configure(env: Env): Promise<Cloudinary> {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  jest.resetModules();
  const { v2 } = await import("cloudinary");
  // The SDK's config is a module-level singleton that survives resetModules();
  // config(true) wipes it and re-reads the env, giving a clean starting point.
  v2.config(true);

  await import("../../src/lib/cloudinary.js");
  return v2;
}

const originalEnv = { ...process.env };
afterAll(() => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, originalEnv);
});

describe("Cloudinary config — discrete triple", () => {
  it("configures the client when all three are set", async () => {
    const c = await configure({
      CLOUDINARY_CLOUD_NAME: "mycloud",
      CLOUDINARY_API_KEY: "k1",
      CLOUDINARY_API_SECRET: "s1",
    });
    expect(c.config().cloud_name).toBe("mycloud");
    expect(c.config().api_key).toBe("k1");
  });

  it("stays unconfigured when only part of the triple is set", async () => {
    const c = await configure({ CLOUDINARY_CLOUD_NAME: "halfcloud" });
    expect(c.config().cloud_name).toBeUndefined();
  });
});

describe("Cloudinary config — CLOUDINARY_URL", () => {
  it("parses a URL-only deployment instead of losing the cloud name", async () => {
    // This is the regression: the old code reported cloud_name undefined here.
    const c = await configure({ CLOUDINARY_URL: "cloudinary://k2:s2@urlcloud" });
    expect(c.config().cloud_name).toBe("urlcloud");
    expect(c.config().api_key).toBe("k2");
  });

  it("prefers the explicit triple when both shapes are present", async () => {
    const c = await configure({
      CLOUDINARY_CLOUD_NAME: "bothcloud",
      CLOUDINARY_API_KEY: "k3",
      CLOUDINARY_API_SECRET: "s3",
      CLOUDINARY_URL: "cloudinary://k4:s4@urlcloud2",
    });
    expect(c.config().cloud_name).toBe("bothcloud");
  });

  it("leaves the client unconfigured when nothing is set", async () => {
    const c = await configure({});
    expect(c.config().cloud_name).toBeUndefined();
  });
});