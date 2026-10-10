import { jest, expect, describe, it, beforeEach } from "@jest/globals";
import request from "supertest";
import app from "../../src/app.js";

// Mock the DB and auth
jest.unstable_mockModule("../../src/config/db.js", () => {
  return {
    default: {
      query: jest.fn(),
      getConnection: jest.fn(),
    }
  };
});
jest.unstable_mockModule("../../src/middleware/auth.js", () => {
  return {
    authenticate: (req: any, res: any, next: any) => {
      req.user = { id: "test-admin", role: "admin" };
      next();
    },
    authorise: () => (req: any, res: any, next: any) => next()
  };
});

// Have to import routes dynamically after mocking
const productsRouter = (await import("../../src/routes/products.js")).default;
app.use("/api/test-products", productsRouter);

const pool = (await import("../../src/config/db.js")).default;

describe("Products API (Mocked DB)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("PATCH excludes its own id from duplicate check", async () => {
    (pool.query as any)
      .mockResolvedValueOnce([[{ name: "Test", image_url: "", package_size: "100g", active: 1 }]]) // find existing
      .mockResolvedValueOnce([[]]); // isDuplicate check returns no OTHER products

    const res = await request(app)
      .patch("/api/test-products/123")
      .send({ name: "Test" });
      
    // The query for isDuplicate should include `id != ?`
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("id != ?"),
      expect.arrayContaining(["123"])
    );
  });

  it("bulk rejects an invalid tag", async () => {
    const res = await request(app)
      .post("/api/test-products/bulk")
      .send({
        products: [
          { name: "Valid", package_size: "100g", price: 10, tag: "Traditional" },
          { name: "Invalid", package_size: "100g", price: 10, tag: "InvalidTag" }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Invalid tag");
  });

  it("PATCH of an inactive product is not blocked by an active twin", async () => {
    // 1st query: get existing
    (pool.query as any).mockResolvedValueOnce([[{ name: "Test", image_url: "", package_size: "100g", active: 0 }]]);
    
    // We update name to "Twin", size "100g", keep active false
    // Since mergedActive is false, isDuplicate shouldn't be called, and it proceeds to UPDATE
    (pool.query as any).mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
    (pool.query as any).mockResolvedValueOnce([]); // Audit log

    const res = await request(app)
      .patch("/api/test-products/123")
      .send({ name: "Twin" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    // Ensure we only did SELECT (get existing), UPDATE, INSERT (audit) -> No 4th query for isDuplicate!
    expect(pool.query).toHaveBeenCalledTimes(3); 
  });
});
