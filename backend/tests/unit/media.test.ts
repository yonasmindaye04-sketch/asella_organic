/**
 * backend/tests/unit/media.test.ts
 * Asella Organic — Site Media validation tests
 *
 * Deliberately scoped to the pure Zod schemas (no Express, no database):
 * these are the rules that decide whether a pasted or uploaded URL is allowed
 * to become a row in site_assets, and they are the only defence against a
 * javascript: URL or a drive.google.com share page reaching <img src>.
 */

import { UpdateAssetSchema, assetKeyShape } from "../../src/schemas/index.js";

describe("Media — asset key shape", () => {
  it("accepts the dotted slugs used by the storefront", () => {
    for (const key of ["category.oils", "highlight.moringa", "hero.banner", "abc"]) {
      expect(assetKeyShape.safeParse(key).success).toBe(true);
    }
  });

  it("rejects uppercase, spaces and slashes", () => {
    for (const key of ["Category.Oils", "category oils", "category/oils", "a"]) {
      expect(assetKeyShape.safeParse(key).success).toBe(false);
    }
  });

  it("rejects path traversal and SQL punctuation", () => {
    for (const key of ["../../etc/passwd", "a'; DROP TABLE users;--", "a b"]) {
      expect(assetKeyShape.safeParse(key).success).toBe(false);
    }
  });

  it("rejects keys longer than the column width", () => {
    expect(assetKeyShape.safeParse("a".repeat(192)).success).toBe(false);
  });
});

describe("Media — asset URL shape", () => {
  const parse = (url: string) => UpdateAssetSchema.safeParse({ url }).success;

  it("accepts https and http URLs", () => {
    expect(parse("https://res.cloudinary.com/demo/image/upload/site/x.png")).toBe(true);
    expect(parse("http://example.com/a.png")).toBe(true);
  });

  it("accepts first-party /image/ and /uploads/ paths", () => {
    expect(parse("/image/products/Moringa.png")).toBe(true);
    expect(parse("/uploads/receipt-abc.png")).toBe(true);
  });

  it("rejects empty and whitespace-only values", () => {
    expect(parse("")).toBe(false);
    expect(parse("   ")).toBe(false);
  });

  it("rejects cloud drive share pages, which are not renderable", () => {
    expect(parse("https://drive.google.com/file/d/ABC123/view")).toBe(false);
    expect(parse("https://www.dropbox.com/s/xyz/photo.png?dl=0")).toBe(false);
  });

  it("rejects script-bearing schemes", () => {
    expect(parse("javascript:alert(1)")).toBe(false);
    expect(parse("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
  });

  it("rejects relative paths outside the allowed prefixes", () => {
    expect(parse("../../wp-config.php")).toBe(false);
    expect(parse("/etc/passwd")).toBe(false);
  });

  it("carries alt_text through and allows it to be omitted", () => {
    const withAlt = UpdateAssetSchema.parse({ url: "/image/a.png", alt_text: "  Moringa  " });
    expect(withAlt.alt_text).toBe("Moringa");
    expect(UpdateAssetSchema.parse({ url: "/image/a.png" }).alt_text).toBeUndefined();
  });
});