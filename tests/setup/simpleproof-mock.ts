/**
 * SimpleProof API Mocking for Integration Tests
 * Phase 2 Week 3: Real Integration Testing
 *
 * Provides mocking for SimpleProof API to avoid financial costs
 * while testing the rest of the attestation system with real operations.
 *
 * Usage:
 * ```typescript
 * beforeEach(() => {
 *   mockSimpleProofAPI();
 * });
 *
 * afterEach(() => {
 *   vi.restoreAllMocks();
 * });
 * ```
 */

import { vi } from "vitest";

// ============================================================================
// TYPES
// ============================================================================

export interface SimpleProofTimestampResponse {
  success: boolean;
  timestamp_id: string;
  ots_proof: string;
  bitcoin_block: number;
  bitcoin_tx: string;
  created_at: number;
}

export interface SimpleProofVerifyResponse {
  success: boolean;
  is_valid: boolean;
  bitcoin_block: number;
  bitcoin_tx: string;
  verified_at: number;
}

// ============================================================================
// MOCK RESPONSES
// ============================================================================

/**
 * Generate a mock SimpleProof timestamp response
 */
export function generateMockTimestampResponse(): SimpleProofTimestampResponse {
  const timestamp = Math.floor(Date.now() / 1000);
  const bitcoinBlock = 850000 + Math.floor(Math.random() * 100);

  return {
    success: true,
    timestamp_id: `sp_ts_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`,
    ots_proof:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    bitcoin_block: bitcoinBlock,
    bitcoin_tx:
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    created_at: timestamp,
  };
}

/**
 * Generate a mock SimpleProof verification response
 */
export function generateMockVerifyResponse(): SimpleProofVerifyResponse {
  return {
    success: true,
    is_valid: true,
    bitcoin_block: 850000 + Math.floor(Math.random() * 100),
    bitcoin_tx:
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    verified_at: Math.floor(Date.now() / 1000),
  };
}

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Mock SimpleProof API endpoints
 * Intercepts fetch calls to SimpleProof and returns mock responses
 */
export function mockSimpleProofAPI(): void {
  const originalFetch = global.fetch;

  global.fetch = vi.fn((url: string | Request, options?: RequestInit) => {
    const urlString = typeof url === "string" ? url : url.url;

    // Mock SimpleProof API calls
    if (
      urlString.includes("simpleproof") ||
      urlString.includes("api.simpleproof")
    ) {
      // Mock timestamp creation
      if (urlString.includes("/timestamp") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve(generateMockTimestampResponse()),
          text: () =>
            Promise.resolve(JSON.stringify(generateMockTimestampResponse())),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response);
      }

      // Mock verification
      if (urlString.includes("/verify") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(generateMockVerifyResponse()),
          text: () =>
            Promise.resolve(JSON.stringify(generateMockVerifyResponse())),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response);
      }

      // Default mock response
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve('{"success": true}'),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response);
    }

    // Pass through non-SimpleProof calls to original fetch
    return originalFetch(url, options);
  }) as any;
}

// ============================================================================
// ERROR SIMULATION
// ============================================================================

/**
 * Mock SimpleProof API with network error
 */
export function mockSimpleProofNetworkError(): void {
  const originalFetch = global.fetch;

  global.fetch = vi.fn((url: string | Request) => {
    const urlString = typeof url === "string" ? url : url.url;

    if (
      urlString.includes("simpleproof") ||
      urlString.includes("api.simpleproof")
    ) {
      return Promise.reject(new Error("Network error"));
    }

    return originalFetch(url);
  }) as any;
}

/**
 * Mock SimpleProof API with timeout
 */
export function mockSimpleProofTimeout(): void {
  const originalFetch = global.fetch;

  global.fetch = vi.fn((url: string | Request) => {
    const urlString = typeof url === "string" ? url : url.url;

    if (
      urlString.includes("simpleproof") ||
      urlString.includes("api.simpleproof")
    ) {
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 100)
      );
    }

    return originalFetch(url);
  }) as any;
}

/**
 * Mock SimpleProof API with HTTP error
 */
export function mockSimpleProofHttpError(statusCode: number = 500): void {
  const originalFetch = global.fetch;

  global.fetch = vi.fn((url: string | Request) => {
    const urlString = typeof url === "string" ? url : url.url;

    if (
      urlString.includes("simpleproof") ||
      urlString.includes("api.simpleproof")
    ) {
      return Promise.resolve({
        ok: false,
        status: statusCode,
        json: () =>
          Promise.resolve({
            success: false,
            error: `HTTP ${statusCode}`,
          }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: false,
              error: `HTTP ${statusCode}`,
            })
          ),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response);
    }

    return originalFetch(url);
  }) as any;
}

// ============================================================================
// MOCK VERIFICATION
// ============================================================================

/**
 * Check if SimpleProof API was called
 */
export function wasSimpleProofCalled(): boolean {
  return (
    (global.fetch as any).mock?.calls?.some((call: any[]) => {
      const url = typeof call[0] === "string" ? call[0] : call[0]?.url;
      return url?.includes("simpleproof") || url?.includes("api.simpleproof");
    }) ?? false
  );
}

/**
 * Get SimpleProof API call count
 */
export function getSimpleProofCallCount(): number {
  return (
    (global.fetch as any).mock?.calls?.filter((call: any[]) => {
      const url = typeof call[0] === "string" ? call[0] : call[0]?.url;
      return url?.includes("simpleproof") || url?.includes("api.simpleproof");
    }).length ?? 0
  );
}

/**
 * Get SimpleProof API calls
 */
export function getSimpleProofCalls(): any[] {
  return (
    (global.fetch as any).mock?.calls?.filter((call: any[]) => {
      const url = typeof call[0] === "string" ? call[0] : call[0]?.url;
      return url?.includes("simpleproof") || url?.includes("api.simpleproof");
    }) ?? []
  );
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Restore original fetch function
 */
export function restoreOriginalFetch(): void {
  vi.restoreAllMocks();
}
