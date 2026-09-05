/**
 * backend/tests/unit/telegram-auth.test.ts
 * Asella Organic — Telegram Mini App initData Verification Unit Tests
 */

import crypto from "crypto";
import { validateTelegramInitData } from "../../src/lib/telegram-auth.js";

describe("Telegram Mini App initData Validation", () => {
  const botToken = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_testtoken";

  function createValidInitData(
    data: Record<string, string>,
    token: string
  ): string {
    const sortedKeys = Object.keys(data).sort();
    const dataCheckParts = sortedKeys.map((k) => `${k}=${data[k]}`);
    const dataCheckString = dataCheckParts.join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(token)
      .digest();

    const hash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const params = new URLSearchParams(data);
    params.set("hash", hash);
    return params.toString();
  }

  it("successfully validates an authentic Telegram initData payload", () => {
    const user = {
      id: 987654321,
      first_name: "Abebe",
      last_name: "Kebede",
      username: "abebe_k",
      language_code: "en",
    };

    const now = Math.floor(Date.now() / 1000);
    const rawData = {
      auth_date: String(now),
      query_id: "AAHdF6IQAAAAAN0XohD_test",
      user: JSON.stringify(user),
      start_param: "ref_ASL123",
    };

    const initData = createValidInitData(rawData, botToken);
    const result = validateTelegramInitData(initData, botToken);

    expect(result.valid).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.id).toBe(987654321);
    expect(result.user?.first_name).toBe("Abebe");
    expect(result.user?.username).toBe("abebe_k");
    expect(result.startParam).toBe("ref_ASL123");
  });

  it("rejects forged initData with an invalid signature", () => {
    const user = { id: 111, first_name: "Hacker" };
    const now = Math.floor(Date.now() / 1000);
    const rawData = {
      auth_date: String(now),
      user: JSON.stringify(user),
    };

    const initData = createValidInitData(rawData, botToken);
    // Tamper with data after signing
    const tamperedInitData = initData.replace("Hacker", "Admin");

    const result = validateTelegramInitData(tamperedInitData, botToken);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid signature");
  });

  it("rejects expired auth_date for replay attack prevention", () => {
    const user = { id: 222, first_name: "StaleUser" };
    // 2 days ago
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 172800;
    const rawData = {
      auth_date: String(twoDaysAgo),
      user: JSON.stringify(user),
    };

    const initData = createValidInitData(rawData, botToken);
    const result = validateTelegramInitData(initData, botToken, 86400);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Authentication expired");
  });

  it("rejects empty or missing hash", () => {
    const result1 = validateTelegramInitData("", botToken);
    expect(result1.valid).toBe(false);

    const result2 = validateTelegramInitData("user=123", botToken);
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain("Missing hash");
  });
});
