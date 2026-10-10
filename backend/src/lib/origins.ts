export const isProduction = process.env.NODE_ENV === "production";

let allowedOriginsString = process.env.ALLOWED_ORIGINS;
if (isProduction && !allowedOriginsString) {
  if (process.env.FRONTEND_URL) {
    allowedOriginsString = process.env.FRONTEND_URL;
  } else {
    allowedOriginsString = "https://www.asellaorganic.com,https://asellaorganic.com";
  }
}

export const allowedOrigins = isProduction
  ? allowedOriginsString!.split(",").map(s => s.trim())
  : ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001"];

const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string): boolean {
  if (!isProduction && devOriginPattern.test(origin)) return true;
  return allowedOrigins.some((allowed) => origin === allowed);
}

if (!allowedOrigins.includes("https://web.telegram.org")) {
  allowedOrigins.push("https://web.telegram.org");
}
