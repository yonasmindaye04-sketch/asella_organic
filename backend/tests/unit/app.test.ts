describe("CORS Origin Validation", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts exact origins and rejects spoofed ones in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGINS = "https://asellaorganic.com,https://www.asellaorganic.com";
    
    const { isAllowedOrigin } = await import("../../src/app.js");
    
    // Exact origins accepted
    expect(isAllowedOrigin("https://asellaorganic.com")).toBe(true);
    expect(isAllowedOrigin("https://www.asellaorganic.com")).toBe(true);
    
    // Telegram web accepted
    expect(isAllowedOrigin("https://web.telegram.org")).toBe(true);
    
    // Spoofed or slightly different origins rejected
    expect(isAllowedOrigin("https://asellaorganic.com.evil.example")).toBe(false);
    expect(isAllowedOrigin("http://asellaorganic.com")).toBe(false); // HTTP instead of HTTPS
    expect(isAllowedOrigin("https://subdomain.asellaorganic.com")).toBe(false);
  });
});
