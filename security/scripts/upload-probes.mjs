#!/usr/bin/env node
/**
 * security/scripts/upload-probes.mjs
 *
 * Receipt upload validation: magic-byte enforcement, extension handling,
 * path traversal, size limits, privacy of stored receipts, and throttling.
 *
 * Active: requires --active and a non-production target.
 * Uploads files: requires --allow-writes.
 *
 * Usage:
 *   node security/scripts/upload-probes.mjs --target https://staging.example.com --active --allow-writes
 */

import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  assertActiveAllowed,
  writesAllowed,
  UsageError,
  SafetyError,
} from "./lib/config.mjs";
import { createHttpClient, header } from "./lib/http.mjs";
import { createSuite } from "./lib/report.mjs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const PDF_MINIMAL = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8"
);

const TEXT_FILE = Buffer.from(
  "This is a plain text file pretending to be an image.\n",
  "utf8"
);

const SVG_FILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>',
  "utf8"
);

let ipCounter = 0;
function rotatingIp() {
  ipCounter += 1;
  const pool = ipCounter % 2 === 0 ? "198.51.100" : "203.0.113";
  return `${pool}.${(ipCounter % 250) + 2}`;
}

function uploadForm(buffer, filename, contentType, field = "receipt") {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type: contentType }), filename);
  return form;
}

async function main() {
  const config = loadConfig({ requireTarget: true });
  assertActiveAllowed(config);

  const suite = createSuite({
    id: "upload-probes",
    name: "Receipt upload validation and privacy",
    mode: "active",
    target: config.target,
    description: "Magic bytes, extension handling, traversal, size, and access control",
  });

  const client = createHttpClient(config);

  // ── Protected image upload ───────────────────────────────────────────────
  const anonymousImage = await client.request("POST", "/api/upload/image", {
    form: uploadForm(PNG_1X1, "probe.png", "image/png", "image"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if ([401, 403].includes(anonymousImage.status)) {
    suite.pass(
      "ASE-FILE-01",
      "Media upload requires authentication",
      "info",
      anonymousImage.status
    );
  } else {
    suite.fail(
      "ASE-FILE-01",
      "Media upload requires authentication",
      "high",
      { status: anonymousImage.status },
      "Keep authenticate + authorise on POST /api/upload/image.",
      ["WSTG-ATHZ-01"]
    );
  }

  // ── Missing file ─────────────────────────────────────────────────────────
  const empty = await client.request("POST", "/api/upload/receipt", {
    form: new FormData(),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if (empty.status === 400) {
    suite.pass("ASE-FILE-02", "Upload without a file is rejected", "info", empty.status);
  } else {
    suite.fail(
      "ASE-FILE-02",
      "Upload without a file is rejected",
      "medium",
      { status: empty.status },
      "Return 400 when no file part is present.",
      ["WSTG-INPV-02"]
    );
  }

  if (!writesAllowed(config)) {
    suite.skip(
      "ASE-FILE-03",
      "Receipt content validation",
      "high",
      "Requires --allow-writes. The target keeps its data untouched."
    );
    suite.finish(config);
    return;
  }

  // ── Valid PNG ────────────────────────────────────────────────────────────
  const valid = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(PNG_1X1, "probe.png", "image/png"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const validUrl = valid.json?.data?.url || null;
  const validFilename = validUrl ? validUrl.split("/").pop() : null;

  if (valid.status === 200 && validUrl) {
    suite.pass("ASE-FILE-03", "A valid PNG receipt is accepted", "info", {
      status: valid.status,
      url: validUrl,
    });
  } else {
    suite.fail(
      "ASE-FILE-03",
      "A valid PNG receipt is accepted",
      "medium",
      { status: valid.status, error: valid.json?.error },
      "Confirm the checkout receipt flow still works end to end."
    );
  }

  // ── Filename shape ───────────────────────────────────────────────────────
  if (validFilename) {
    const shape = /^receipt-[a-f0-9]{16}-\d+\.(png|jpe?g|webp|pdf)$/i.test(validFilename);
    if (shape) {
      suite.pass(
        "ASE-FILE-04",
        "Stored receipt filenames are server generated",
        "info",
        validFilename
      );
    } else {
      suite.fail(
        "ASE-FILE-04",
        "Stored receipt filenames are server generated",
        "medium",
        { filename: validFilename },
        "Generate the filename on the server from a random suffix and the detected extension.",
        ["CWE-22"]
      );
    }
  } else {
    suite.skip("ASE-FILE-04", "Stored receipt filenames are server generated", "medium", "No upload succeeded.");
  }

  // ── Text file with an image extension ────────────────────────────────────
  const disguised = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(TEXT_FILE, "receipt.png", "image/png"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if ([400, 415].includes(disguised.status)) {
    suite.pass(
      "ASE-FILE-05",
      "A text file with an image extension is rejected",
      "info",
      disguised.status
    );
  } else {
    suite.fail(
      "ASE-FILE-05",
      "A text file with an image extension is rejected",
      "high",
      { status: disguised.status },
      "Keep magic-byte validation with file-type and force the extension from the detected type.",
      ["WSTG-FILE-02", "CWE-434"]
    );
  }

  // ── SVG with script ──────────────────────────────────────────────────────
  const svg = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(SVG_FILE, "receipt.svg", "image/svg+xml"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if ([400, 415].includes(svg.status)) {
    suite.pass(
      "ASE-FILE-06",
      "SVG uploads with scripts are rejected",
      "info",
      svg.status
    );
  } else {
    suite.fail(
      "ASE-FILE-06",
      "SVG uploads with scripts are rejected",
      "high",
      { status: svg.status },
      "Allow only PNG, JPEG, WebP, and PDF receipts. SVG is executable content.",
      ["WSTG-FILE-02", "CWE-79"]
    );
  }

  // ── Path traversal in the filename ───────────────────────────────────────
  const traversal = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(PNG_1X1, "../../../../evil.png", "image/png"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  const traversalUrl = traversal.json?.data?.url || "";
  if (traversal.status !== 200) {
    suite.pass(
      "ASE-FILE-07",
      "Path traversal in the upload filename is neutralised",
      "info",
      { status: traversal.status }
    );
  } else if (!traversalUrl.includes("..") && /\/api\/receipts\/[A-Za-z0-9._-]+$/.test(traversalUrl)) {
    suite.pass(
      "ASE-FILE-07",
      "Path traversal in the upload filename is neutralised",
      "info",
      { url: traversalUrl }
    );
  } else {
    suite.fail(
      "ASE-FILE-07",
      "Path traversal in the upload filename is neutralised",
      "critical",
      { url: traversalUrl },
      "Never use the client filename. Generate the stored name from a random suffix.",
      ["WSTG-FILE-01", "CWE-22"]
    );
  }

  // ── Oversized file ───────────────────────────────────────────────────────
  const oversized = Buffer.alloc(6 * 1024 * 1024, 0x41);
  const big = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(oversized, "receipt.png", "image/png"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if ([400, 413].includes(big.status)) {
    suite.pass("ASE-FILE-08", "Oversized uploads are rejected", "info", big.status);
  } else {
    suite.fail(
      "ASE-FILE-08",
      "Oversized uploads are rejected",
      "medium",
      { status: big.status },
      "Keep the 5 MB limit and map the multer LIMIT_FILE_SIZE error to 413.",
      ["WSTG-INPV-07"]
    );
  }

  // ── Wrong field name ─────────────────────────────────────────────────────
  const wrongField = await client.request("POST", "/api/upload/receipt", {
    form: uploadForm(PNG_1X1, "probe.png", "image/png", "avatar"),
    headers: { "x-forwarded-for": rotatingIp() },
  });
  if ([400, 422].includes(wrongField.status)) {
    suite.pass("ASE-FILE-09", "Uploads with an unexpected field name are rejected", "info", wrongField.status);
  } else {
    suite.warn(
      "ASE-FILE-09",
      "Uploads with an unexpected field name are rejected",
      "low",
      { status: wrongField.status },
      "Reject unexpected multipart field names."
    );
  }

  // ── Stored receipt privacy ───────────────────────────────────────────────
  if (validUrl) {
    const anonymousRead = await client.get(validUrl, { origin: false });
    if ([401, 403].includes(anonymousRead.status)) {
      suite.pass(
        "ASE-FILE-10",
        "Stored receipts are not publicly readable",
        "info",
        { url: validUrl, status: anonymousRead.status }
      );
    } else {
      suite.fail(
        "ASE-FILE-10",
        "Stored receipts are not publicly readable",
        "high",
        { url: validUrl, status: anonymousRead.status },
        "Keep receipts outside the public web root and behind authenticate + the receipt allow-list.",
        ["CWE-552", "SECURITY_REVIEW.md"]
      );
    }

    // The receipt must not be reachable from the public uploads directory.
    // A 401 or 403 is as safe as a 404 — the file is not readable — and a
    // 200 that is not actually the file (for example the SPA shell) is not
    // an exposure either. Only a served file counts.
    const publicPath = await client.get(`/uploads/${validFilename}`, { origin: false });
    const publicType = String(header(publicPath, "content-type") || "").toLowerCase();
    const servedFile =
      publicPath.status >= 200 &&
      publicPath.status < 300 &&
      (/^image\//.test(publicType) ||
        /^application\/(octet-stream|pdf|zip)/.test(publicType) ||
        /^text\/plain/.test(publicType));

    if (!servedFile) {
      suite.pass(
        "ASE-FILE-11",
        "Stored receipts are not exposed under the public uploads path",
        "info",
        { status: publicPath.status, contentType: publicType || "(none)" }
      );
    } else {
      suite.fail(
        "ASE-FILE-11",
        "Stored receipts are not exposed under the public uploads path",
        "high",
        { path: `/uploads/${validFilename}`, status: publicPath.status, contentType: publicType },
        "Store receipts in the private directory only.",
        ["CWE-552"]
      );
    }

    const responseText = valid.text || "";
    if (/(?:\/home\/|\/var\/|C:\\|private[\\/]receipts)/i.test(responseText)) {
      suite.fail(
        "ASE-FILE-12",
        "Upload responses do not leak server paths",
        "medium",
        responseText.slice(0, 300),
        "Return only the relative receipt URL.",
        ["WSTG-INFO-04"]
      );
    } else {
      suite.pass("ASE-FILE-12", "Upload responses do not leak server paths", "info");
    }

    // Content-Type of the stored file must not be attacker controlled.
    const contentTypeHeader = header(anonymousRead, "content-type");
    if (contentTypeHeader && /\btext\/html\b/i.test(contentTypeHeader)) {
      suite.fail(
        "ASE-FILE-13",
        "Stored receipts are served with a safe content type",
        "high",
        { contentType: contentTypeHeader },
        "Serve receipts with Content-Type: application/octet-stream or the detected type plus nosniff.",
        ["CWE-79"]
      );
    } else {
      suite.pass(
        "ASE-FILE-13",
        "Stored receipts are served with a safe content type",
        "info",
        { contentType: contentTypeHeader }
      );
    }
  } else {
    suite.skip("ASE-FILE-10", "Stored receipt privacy", "high", "No upload succeeded.");
  }

  // ── Throttling ───────────────────────────────────────────────────────────
  const throttleIp = rotatingIp();
  const throttleStatuses = [];
  for (let i = 0; i < 12; i += 1) {
    const response = await client.request("POST", "/api/upload/receipt", {
      form: uploadForm(PNG_1X1, `probe-${i}.png`, "image/png"),
      headers: { "x-forwarded-for": throttleIp },
    });
    throttleStatuses.push(response.status);
  }

  if (throttleStatuses.includes(429)) {
    suite.pass(
      "ASE-FILE-14",
      "Receipt uploads are rate limited",
      "info",
      { statuses: throttleStatuses }
    );
  } else {
    suite.fail(
      "ASE-FILE-14",
      "Receipt uploads are rate limited",
      "medium",
      { statuses: throttleStatuses },
      "The public upload route should return 429 after 10 uploads per 5 minutes per IP.",
      ["WSTG-ATHN-03", "CWE-400"]
    );
  }

  // ── Record artifacts for the authorization suite ─────────────────────────
  try {
    fs.mkdirSync(config.reportDir, { recursive: true });
    const artifactPath = path.join(config.reportDir, "artifacts.json");
    const existing = fs.existsSync(artifactPath)
      ? JSON.parse(fs.readFileSync(artifactPath, "utf8"))
      : {};
    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        { ...existing, receiptFilename: validFilename, receiptUrl: validUrl },
        null,
        2
      )
    );
    suite.pass(
      "ASE-FILE-15",
      "Receipt artifact recorded for later suites",
      "info",
      artifactPath
    );
  } catch (error) {
    suite.warn(
      "ASE-FILE-15",
      "Receipt artifact recorded for later suites",
      "low",
      error.message
    );
  }

  suite.finish(config);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof SafetyError) {
    console.error(`\n[security] ${error.message}\n`);
    process.exit(error.exitCode || 2);
  }
  console.error("\n[security] upload probes failed:", error);
  process.exit(1);
});
