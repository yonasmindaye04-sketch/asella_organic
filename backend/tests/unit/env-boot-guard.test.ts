/**
 * backend/tests/unit/env-boot-guard.test.ts
 *
 * ASE-2026-003 — proving the BOOT guard in src/config/env.ts refuses to
 * start the application without a usable JWT signing key.
 *
 * Why this test spawns a child process instead of importing env.ts
 * in-process:
 *
 *   env.ts does its work at module-evaluation time and calls
 *   process.exit(78) when the key is unusable. Importing it in-process
 *   would kill the Jest worker. Spawning a child gives us the real
 *   observable behaviour an operator sees: the exit code and the message
 *   on stderr.
 *
 * The child is `node --import tsx --eval "import('./src/config/env.js')"` —
 * the same module the server loads (src/server.ts does
 * `import "./config/env.js"`).
 *
 * Note on dotenv: env.ts calls dotenv.config(), and dotenv does NOT
 * override a variable that is already present in process.env. Setting
 * JWT_SECRET="" in the child's environment therefore survives the .env
 * load, which lets us drive the guard deterministically regardless of
 * what the developer's local .env contains.
 *
 * No DB, no network.
 */

import { describe, it, expect } from "@jest/globals";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname_, "..", "..");

/** Exit code used for a configuration error (sysexits.h EX_USAGE). */
const CONFIG_ERROR_EXIT_CODE = 78;

interface BootResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Boot src/config/env.ts in a child process with the given environment
 * overrides.
 */
function bootEnv(envOverrides: Record<string, string>): BootResult {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "--eval", "import('./src/config/env.js')"],
      {
        cwd: BACKEND_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Explicitly blank these so a developer's local .env cannot
          // change the outcome of the test. dotenv does not overwrite a
          // variable that is already present in process.env, so the
          // blanks survive the .env load inside env.ts.
          JWT_SECRET: "",
          JWT_SECRET_PREVIOUS: "",
          ...envOverrides,
        },
      },
    );
    return { status: 0, stdout: String(stdout), stderr: "" };
  } catch (err) {
    const e = err as {
      status?: number;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    return {
      status: typeof e.status === "number" ? e.status : -1,
      stdout: e.stdout ? String(e.stdout) : "",
      stderr: e.stderr ? String(e.stderr) : "",
    };
  }
}

describe("env.ts boot guard (ASE-2026-003)", () => {
  it("exits 78 when JWT_SECRET is missing", () => {
    const result = bootEnv({ JWT_SECRET: "" });
    expect(result.status).toBe(CONFIG_ERROR_EXIT_CODE);
    expect(result.stderr).toContain("FATAL");
    expect(result.stderr).toContain("JWT_SECRET");
  });

  it("exits 78 when JWT_SECRET is shorter than 32 characters", () => {
    const result = bootEnv({ JWT_SECRET: "tooshort" });
    expect(result.status).toBe(CONFIG_ERROR_EXIT_CODE);
    expect(result.stderr).toContain("FATAL");
  });

  it("exits 78 when JWT_SECRET_PREVIOUS is shorter than 32 characters", () => {
    const result = bootEnv({
      JWT_SECRET: "a-valid-secret-that-is-at-least-32-chars-long",
      JWT_SECRET_PREVIOUS: "short",
    });
    expect(result.status).toBe(CONFIG_ERROR_EXIT_CODE);
    expect(result.stderr).toContain("JWT_SECRET_PREVIOUS");
  });

  it("points the operator at the remediation", () => {
    const result = bootEnv({ JWT_SECRET: "" });
    expect(result.stderr).toContain("Remediation");
    expect(result.stderr).toContain("randomBytes");
  });

  it("explains the zero-downtime rotation procedure", () => {
    const result = bootEnv({ JWT_SECRET: "" });
    expect(result.stderr).toContain("JWT_SECRET_PREVIOUS");
  });

  it("boots successfully when JWT_SECRET is long enough", () => {
    const result = bootEnv({
      JWT_SECRET: "a-valid-secret-that-is-at-least-32-chars-long",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("FATAL");
  });

  it("boots successfully when a rotation window is open", () => {
    const result = bootEnv({
      JWT_SECRET: "a-valid-secret-that-is-at-least-32-chars-long",
      JWT_SECRET_PREVIOUS: "the-previous-secret-also-at-least-32-chars",
    });
    expect(result.status).toBe(0);
  });

  it("never prints the secret value on failure", () => {
    const result = bootEnv({ JWT_SECRET: "" });
    expect(result.stderr).not.toContain("asella-organic-preview-jwt-secret");
  });
});
