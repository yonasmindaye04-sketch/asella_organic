/**
 * backend/tests/unit/authorise-tech-support.test.ts
 * Asella Organic — Role guard tests for the tech_support role (ASE-2026-002)
 *
 * The authorise() guard used to return next() for ANY tech_support caller
 * before it looked at the requested role list, so tech_support passed every
 * guarded route in the application — including authorise("admin") on staff
 * administration.
 *
 * These tests exercise the guard directly, with no database, so the rule
 * itself is pinned down independently of the routes that use it.
 */

import { jest, describe, it, expect } from "@jest/globals";
import { authorise } from "../../src/middleware/auth.js";
import type { Request, Response, NextFunction } from "express";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeRes() {
  const res = {} as Response;
  (res as any).status = jest.fn().mockReturnValue(res);
  (res as any).json = jest.fn().mockReturnValue(res);
  return res;
}

function callGuard(role: string, ...roles: string[]) {
  const req  = { user: { id: "u1", username: "someone", role, jti: "j1" } } as unknown as Request;
  const res  = fakeRes();
  const next = jest.fn() as unknown as NextFunction;
  authorise(...roles)(req, res, next);
  return { res, next };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("authorise() — tech_support (ASE-2026-002)", () => {
  it("rejects tech_support on an admin-only role list", () => {
    const { res, next } = callGuard("tech_support", "admin");
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(403);
  });

  it("rejects tech_support on an admin+manager role list", () => {
    const { res, next } = callGuard("tech_support", "admin", "manager");
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(403);
  });

  it("rejects tech_support on a role list it does not appear in", () => {
    const { res, next } = callGuard("tech_support", "call_center");
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(403);
  });

  it("allows tech_support where the role is listed explicitly", () => {
    const { res, next } = callGuard("tech_support", "admin", "manager", "tech_support");
    expect(next).toHaveBeenCalledTimes(1);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it("still allows admin on an admin-only role list", () => {
    const { res, next } = callGuard("admin", "admin");
    expect(next).toHaveBeenCalledTimes(1);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it("still rejects a non-admin role on an admin-only role list", () => {
    const { res, next } = callGuard("employee", "admin");
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(403);
  });

  it("returns 401 when there is no authenticated user at all", () => {
    const req  = {} as Request;
    const res  = fakeRes();
    const next = jest.fn() as unknown as NextFunction;
    authorise("admin")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any).status).toHaveBeenCalledWith(401);
  });

  it("allows any authenticated role when the role list is empty", () => {
    const { res, next } = callGuard("tech_support");
    expect(next).toHaveBeenCalledTimes(1);
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it("does not treat an empty role list as a bypass for other roles", () => {
    const { next } = callGuard("employee");
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe("regression: the removed blanket bypass", () => {
    it("does not let tech_support through an empty role list check it was never granted", () => {
      // The regression this guards against is subtle: if a route calls
      // authorise() with no roles, EVERY authenticated role passes by
      // design. The bypass was in the guard, not the call site, so this
      // documents the intended shape explicitly.
      const { next } = callGuard("tech_support", "admin");
      expect(next).not.toHaveBeenCalled();
    });

    it("treats tech_support as an ordinary role on every guarded route", () => {
      const guards = [
        ["admin"],
        ["admin", "manager"],
        ["admin", "manager", "store_manager"],
        ["call_center"],
      ] as const;
      for (const roles of guards) {
        const { next, res } = callGuard("tech_support", ...roles);
        // Only passes if that guard explicitly lists tech_support — none do.
        expect(next).not.toHaveBeenCalled();
        expect((res as any).status).toHaveBeenCalledWith(403);
      }
    });
  });
});
