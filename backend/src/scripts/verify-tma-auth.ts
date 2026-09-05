/**
 * backend/src/scripts/verify-tma-auth.ts
 * Verification script for Telegram Mini App HMAC-SHA256 validation.
 */

import crypto from "crypto";
import { validateTelegramInitData } from "../lib/telegram-auth.js";

const testBotToken = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_testtoken";

function generateTestInitData(data: Record<string, string>, token: string): string {
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

console.log("Running Telegram Mini App HMAC Validation Suite...\n");

// Test 1: Authentic payload
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

const authenticInitData = generateTestInitData(rawData, testBotToken);
const result1 = validateTelegramInitData(authenticInitData, testBotToken);

if (result1.valid && result1.user?.id === 987654321 && result1.startParam === "ref_ASL123") {
  console.log("[PASS] Test 1: Authentic Telegram initData verified successfully.");
} else {
  console.error("[FAIL] Test 1: Failed to verify authentic payload:", result1);
  process.exit(1);
}

// Test 2: Tampered payload
const tamperedInitData = authenticInitData.replace("Abebe", "MaliciousUser");
const result2 = validateTelegramInitData(tamperedInitData, testBotToken);

if (!result2.valid && result2.error?.includes("Invalid signature")) {
  console.log("[PASS] Test 2: Tampered data correctly rejected with signature mismatch.");
} else {
  console.error("[FAIL] Test 2: Tampered data was unexpectedly accepted:", result2);
  process.exit(1);
}

// Test 3: Expired auth_date (replay protection)
const staleData = {
  auth_date: String(now - 172800), // 2 days old
  user: JSON.stringify(user),
};
const expiredInitData = generateTestInitData(staleData, testBotToken);
const result3 = validateTelegramInitData(expiredInitData, testBotToken, 86400);

if (!result3.valid && result3.error?.includes("Authentication expired")) {
  console.log("[PASS] Test 3: Expired initData correctly rejected (replay protection).");
} else {
  console.error("[FAIL] Test 3: Expired initData was not rejected:", result3);
  process.exit(1);
}

// Test 4: Missing hash
const result4 = validateTelegramInitData("user=123", testBotToken);
if (!result4.valid && result4.error?.includes("Missing hash")) {
  console.log("[PASS] Test 4: Missing hash correctly rejected.");
} else {
  console.error("[FAIL] Test 4: Failed to reject missing hash:", result4);
  process.exit(1);
}

console.log("\nAll 4 Telegram Mini App verification checks passed!");
