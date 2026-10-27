export const isProduction = process.env.NODE_ENV === "production";

let allowedOriginsString = process.env.ALLOWED_ORIGINS;
if (isProduction && !allowedOriginsString) {
  if (process.env.FRONTEND_URL) {
    allowedOriginsString = process.env.FRONTEND_URL;
  } else {
    allowedOriginsString = "https://www.asellaorganic.com,https://asellaorganic.com";
  }
}

export const allowedOrigins = (isProduction ? allowedOriginsString! : "http://localhost:5173,http://localhost:3000,http://localhost:3001")
  .split(",")
  .map(s => s.trim().replace(/\/+$/, ""))
  .filter(s => s.length > 0);

const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const previewOriginPattern = /^https:\/\/[a-z0-9-]+\.run\.app$/i;

export function isAllowedOrigin(origin: string): boolean {
  if (!isProduction && devOriginPattern.test(origin)) return true;
  if (previewOriginPattern.test(origin)) return true;
  return allowedOrigins.some((allowed) => origin === allowed);
}

if (!allowedOrigins.includes("https://web.telegram.org")) {
  allowedOrigins.push("https://web.telegram.org");
}

console.log("Allowed CORS origins:", allowedOrigins);
