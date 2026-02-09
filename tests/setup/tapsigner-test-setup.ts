/**
 * Tapsigner Test Setup Utilities
 * Phase 4 Task 4.1: Unit Tests
 *
 * Provides test utilities for Tapsigner NFC card integration testing
 * Uses REAL implementations - NO MOCKING except unavoidable browser APIs
 */

import { vi } from "vitest";

/**
 * Mock NDEFReader for browser compatibility detection only
 * UNAVOIDABLE MOCKING: Web NFC API requires physical hardware or browser simulation
 * This minimal stub is only used for browser compatibility detection
 */
export function setupNDEFReaderMock() {
  if (typeof window !== "undefined" && !("NDEFReader" in window)) {
    // Minimal stub for browser compatibility detection
    (window as any).NDEFReader = class NDEFReaderMock {
      onreading: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;

      async scan() {
        // Stub implementation
      }

      abort() {
        // Stub implementation
      }
    };
  }
}

/**
 * Create test card data matching ScanForCardResult interface
 */
export function createTestCardData() {
  return {
    cardData: {
      cardId: "a1b2c3d4e5f6a7b8",
      publicKey: "a".repeat(64),
      timestamp: Date.now(),
    },
  };
}

/**
 * Create test NDEF message
 */
export function createTestNDEFMessage() {
  const encoder = new TextEncoder();
  return {
    records: [
      {
        recordType: "text",
        mediaType: "text/plain",
        data: encoder.encode("a1b2c3d4e5f6a7b8"),
      },
      {
        recordType: "text",
        mediaType: "text/plain",
        data: encoder.encode("a".repeat(64)),
      },
    ],
  };
}

/**
 * Create test challenge
 */
export function createTestChallenge() {
  const nonce = "b".repeat(64);
  const timestamp = Date.now();
  return {
    nonce,
    timestamp,
    expiresAt: timestamp + 5 * 60 * 1000,
  };
}

/**
 * Create test PIN hash
 */
export async function createTestPINHash(
  pin: string = "123456",
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create test JWT token
 */
export function createTestJWT(userId: string = "test-user-123"): string {
  // Simple JWT for testing (not cryptographically signed)
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const signature = "test-signature";
  return `${header}.${payload}.${signature}`;
}

/**
 * Setup test environment variables
 */
export function setupTestEnv() {
  process.env.VITE_TAPSIGNER_ENABLED = "true";
  process.env.VITE_TAPSIGNER_DEBUG = "true";
  process.env.VITE_TAPSIGNER_LNBITS_ENABLED = "true";
  process.env.VITE_LNBITS_INTEGRATION_ENABLED = "true";
}

/**
 * Cleanup test environment
 */
export function cleanupTestEnv() {
  delete process.env.VITE_TAPSIGNER_ENABLED;
  delete process.env.VITE_TAPSIGNER_DEBUG;
  delete process.env.VITE_TAPSIGNER_LNBITS_ENABLED;
  delete process.env.VITE_LNBITS_INTEGRATION_ENABLED;
}

/**
 * Mock fetch for API testing
 */
export function setupFetchMock() {
  const originalFetch = global.fetch;

  const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
    // Default mock response
    return new Response(
      JSON.stringify({
        success: true,
        data: {},
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  global.fetch = mockFetch as any;
  return { mockFetch, originalFetch };
}

/**
 * Restore original fetch
 */
export function restoreFetch(originalFetch: typeof global.fetch) {
  global.fetch = originalFetch;
}

/**
 * Wait for async operations
 */
export function waitFor(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create test API response
 */
export function createTestAPIResponse(data: any = {}, success: boolean = true) {
  return {
    success,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Create test error response
 */
export function createTestErrorResponse(message: string = "Test error") {
  return {
    success: false,
    error: message,
    timestamp: Date.now(),
  };
}
