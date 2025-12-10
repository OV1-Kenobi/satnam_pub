/**
 * Vitest Setup File
 *
 * Global configuration and setup for all Vitest tests
 */

import "@testing-library/jest-dom";
import { afterAll, beforeAll, vi } from "vitest";
import { globalTestCleanup } from "./lib/__tests__/test-setup";

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Test environment variables are automatically available in Vitest
 */

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  // Set required VITE environment variables for tests
  process.env.VITE_LNBITS_INTEGRATION_ENABLED =
    process.env.VITE_LNBITS_INTEGRATION_ENABLED || "false";
  process.env.VITE_LNBITS_BASE_URL =
    process.env.VITE_LNBITS_BASE_URL || "http://localhost:5000/mock-lnbits";
  process.env.VITE_BLOSSOM_UPLOAD_ENABLED =
    process.env.VITE_BLOSSOM_UPLOAD_ENABLED || "true";
  process.env.VITE_BLOSSOM_PRIMARY_URL =
    process.env.VITE_BLOSSOM_PRIMARY_URL ||
    "http://localhost:5000/mock-blossom";
  // Provide a base origin for relative URL fetch() in JSDOM tests
  if (!(globalThis as any).location) {
    (globalThis as any).location = { origin: "http://localhost:8000" } as any;
  }

  // Set default test configuration
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn(
      "⚠️  No test database URL found. Some integration tests may fail."
    );
  }

  // Provide Web Crypto and TextEncoder for libs that expect Node globals
  if (!(globalThis as any).crypto || !(globalThis as any).crypto.subtle) {
    const { webcrypto } = await import("node:crypto");
    (globalThis as any).crypto = webcrypto as unknown as Crypto;
  }
  if (!(globalThis as any).TextEncoder) {
    const { TextEncoder } = await import("node:util");
    (globalThis as any).TextEncoder =
      TextEncoder as unknown as typeof globalThis.TextEncoder;
  }

  // Initialize the shared test client to prevent multiple GoTrueClient instances
  const { getTestSupabaseClient } = await import("./lib/__tests__/test-setup");
  getTestSupabaseClient(); // Initialize the shared client early
});

// Global test cleanup
afterAll(async () => {
  // Cleanup any global resources if needed
  await globalTestCleanup();
});

// Mock console methods for cleaner test output using Vitest spies
beforeAll(() => {
  // Store original implementations
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  vi.spyOn(console, "error").mockImplementation((...args: any[]) => {
    // Only show errors that aren't expected test errors
    if (!args[0]?.toString().includes("Cannot connect to test database")) {
      originalConsoleError(...args);
    }
  });

  vi.spyOn(console, "warn").mockImplementation((...args: any[]) => {
    // Filter out common test warnings
    if (!args[0]?.toString().includes("test database")) {
      originalConsoleWarn(...args);
    }
  });
});

// Vitest automatically restores spies after tests, no manual cleanup needed
