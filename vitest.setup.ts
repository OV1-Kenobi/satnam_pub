/**
 * Vitest Setup File
 *
 * Global configuration and setup for all Vitest tests
 */

import dotenv from "dotenv";
import { afterAll, beforeAll, vi } from "vitest";
import { globalTestCleanup } from "./lib/__tests__/test-setup";

// Load environment variables for testing
dotenv.config({ path: ".env.test" });
dotenv.config({ path: ".env" });

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  // Set default test configuration
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn(
      "⚠️  No test database URL found. Some integration tests may fail."
    );
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
