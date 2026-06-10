/**
 * frontend/tests/setup.ts
 * Global test setup for Vitest + React Testing Library
 */

import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock axios globally so tests don't make real HTTP calls
vi.mock("axios", () => ({
  default: {
    get:    vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    post:   vi.fn().mockResolvedValue({ data: { success: true } }),
    patch:  vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    create: vi.fn(() => ({
      get:    vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
      post:   vi.fn().mockResolvedValue({ data: { success: true } }),
      patch:  vi.fn().mockResolvedValue({ data: { success: true } }),
      delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    })),
  },
}));

// Mock window.matchMedia for dark mode tests
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.location for redirect tests
Object.defineProperty(window, "location", {
  value: {
    href:     "http://localhost/",
    origin:   "http://localhost",
    pathname: "/",
    assign:   vi.fn(),
    reload:   vi.fn(),
  },
  writable:     true,
  configurable: true,
});

// Suppress noisy console.error in tests unless explicitly tested
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("Warning:")) return;
    originalError(...args);
  };
});
afterEach(() => {
  console.error = originalError;
});