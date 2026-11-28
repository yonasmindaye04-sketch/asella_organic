/**
 * security/scripts/lib/http.mjs
 *
 * Minimal HTTP client for the security suite.
 * Built on Node's global fetch. Adds:
 *   - origin header by default (the API enforces Origin on writes)
 *   - fixed-rate throttling so active tests do not hammer staging
 *   - cookie capture / replay
 *   - JSON parsing without throwing
 *   - same-origin guard unless explicitly overridden
 */

import crypto from "node:crypto";

const USER_AGENT =
  "AsellaSecuritySuite/1.0 (authorized security testing; contact: security@asellaorganic.com)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  constructor(config) {
    this.config = config;
    this.base = new URL(config.target);
    this.minIntervalMs = Math.ceil(1000 / config.rps);
    this.lastRequestAt = 0;
    this.cookies = new Map();
  }

  async throttle() {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  cookieHeader() {
    if (this.cookies.size === 0) return "";
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  captureCookies(setCookieHeaders) {
    for (const line of setCookieHeaders || []) {
      const first = line.split(";")[0];
      const eq = first.indexOf("=");
      if (eq === -1) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!name) continue;
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /**
   * @param {string} method
   * @param {string} requestPath
   * @param {object} [options]
   * @param {string} [options.token]        Bearer token
   * @param {unknown} [options.body]        JSON body
   * @param {FormData} [options.form]       multipart body (takes precedence)
   * @param {object} [options.headers]
   * @param {string|false} [options.origin] Origin header; false disables it
   * @param {boolean} [options.absolute]    Treat requestPath as an absolute URL
   * @param {boolean} [options.useCookies]  Replay captured cookies (default true)
   * @param {string} [options.redirect]     "follow" | "manual" | "error"
   */
  async request(method, requestPath, options = {}) {
    const {
      token,
      body,
      form,
      headers: extraHeaders = {},
      origin,
      absolute = false,
      useCookies = true,
      redirect = "manual",
    } = options;

    let url;
    if (absolute) {
      url = new URL(requestPath);
    } else {
      url = new URL(requestPath, this.base);
      if (url.origin !== this.base.origin) {
        throw new Error(
          `Refusing cross-origin request without absolute=true: ${url.origin}`
        );
      }
    }

    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      "x-request-id": crypto.randomUUID(),
      ...extraHeaders,
    };

    if (origin !== false) {
      headers.Origin = origin || this.base.origin;
    }

    if (token) headers.Authorization = `Bearer ${token}`;

    const cookie = useCookies ? this.cookieHeader() : "";
    if (cookie) headers.Cookie = cookie;

    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }

    await this.throttle();

    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payload,
        redirect,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      const text = await response.text();
      const ms = Math.round(performance.now() - startedAt);

      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      const setCookie =
        typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : response.headers.get("set-cookie")
            ? [response.headers.get("set-cookie")]
            : [];

      this.captureCookies(setCookie);

      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        setCookie,
        text,
        json,
        ms,
        url: url.toString(),
        method,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        headers: {},
        setCookie: [],
        text: "",
        json: null,
        ms: Math.round(performance.now() - startedAt),
        url: url.toString(),
        method,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  get(path, options) {
    return this.request("GET", path, options);
  }

  post(path, body, options = {}) {
    return this.request("POST", path, { ...options, body });
  }

  patch(path, body, options = {}) {
    return this.request("PATCH", path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request("PUT", path, { ...options, body });
  }

  delete(path, options) {
    return this.request("DELETE", path, options);
  }

  async login(username, password, options = {}) {
    const response = await this.post(
      "/api/auth/login",
      { username, password },
      options
    );
    const token =
      response.json?.data?.token ||
      response.json?.token ||
      response.json?.data?.accessToken ||
      null;

    return {
      response,
      token,
      refreshToken:
        response.json?.data?.refreshToken || response.json?.refreshToken || null,
      user: response.json?.data?.user || response.json?.user || null,
      cookies: [...this.cookies.entries()],
    };
  }
}

export function createHttpClient(config) {
  return new HttpClient(config);
}

export function header(response, name) {
  return response?.headers?.[String(name).toLowerCase()] ?? null;
}

export function contentType(response) {
  return String(header(response, "content-type") || "").toLowerCase();
}

export function cookieValue(response, name) {
  for (const line of response?.setCookie || []) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    if (first.slice(0, eq).trim() === name) return first.slice(eq + 1).trim();
  }
  return null;
}

export function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const decode = (part) => {
    try {
      return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  };

  return { header: decode(parts[0]), payload: decode(parts[1]), signature: parts[2] };
}

/**
 * Parses a response body, transparently unwrapping a double-encoded body.
 *
 * A double-encoded body is a JSON string whose content is itself JSON — for
 * example `"{\"success\":true}"` instead of `{"success":true}`. Servers that
 * cache a response by stringifying an already-stringified value produce this,
 * and a client that assumes a plain object silently sees a string instead.
 *
 * @returns {{ value: unknown, doubleEncoded: boolean }}
 */
export function parseJsonBody(response) {
  let value = response?.json ?? null;
  if (typeof value !== "string") return { value, doubleEncoded: false };

  try {
    return { value: JSON.parse(value), doubleEncoded: true };
  } catch {
    // A legitimate JSON string response, not a double-encoded body.
    return { value, doubleEncoded: false };
  }
}

export function sleepMs(ms) {
  return sleep(ms);
}
