/**
 * SimpleProof Service
 * Phase 2B-2 Day 8: SimpleProof Integration
 * Phase 2B-2 Day 15: Error Monitoring & Logging Enhancement
 *
 * Provides client-side wrapper around simpleproof-timestamp and simpleproof-verify
 * endpoints for blockchain-based proof of existence and timestamp verification.
 *
 * Feature Flag: VITE_SIMPLEPROOF_ENABLED (default: false, opt-in)
 */

import { clientConfig } from "../config/env.client";
import {
  addSimpleProofBreadcrumb,
  captureSimpleProofError,
} from "../lib/sentry";
import {
  localValidateOtsProof,
  LocalOtsValidationResult,
} from "../lib/simpleproof/opentimestampsLocalValidator";
import { createLogger, logCacheEvent, logOperation } from "./loggingService";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TimestampCreateRequest {
  data: string;
  verification_id: string;
  metadata?: Record<string, any>;
}

export interface TimestampResult {
  success: boolean;
  timestamp_id?: string;
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  verified_at: number;
  error?: string;
}

export interface TimestampVerifyRequest {
  ots_proof: string;
}

export interface VerificationResult {
  success: boolean;
  is_valid: boolean;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  confidence: string; // "high", "medium", "low", "unconfirmed"
  verified_at: number;
  cached?: boolean;
  error?: string;
}

export interface Timestamp {
  id: string;
  verification_id: string;
  ots_proof: string;
  bitcoin_block: number | null;
  bitcoin_tx: string | null;
  created_at: number;
  verified_at: number | null;
  is_valid: boolean | null;
}

export interface TimestampHistoryRequest {
  /**
   * PRIVACY REQUIREMENT: user_id MUST be hashed before passing to this service
   * - Use auth.user?.hashed_npub if available
   * - Or use hashUserData() from lib/security/privacy-hashing.js
   * - NEVER pass raw user IDs, UUIDs, npubs, or other PII
   */
  user_id: string;
  limit?: number;
}

export interface TimestampHistoryResponse {
  success: boolean;
  timestamps: Timestamp[];
  total: number;
  error?: string;
}

export interface TimestampByIdRequest {
  timestamp_id: string;
}

export interface TimestampByIdResponse {
  success: boolean;
  timestamp: Timestamp | null;
  error?: string;
}

// ============================================================================
// PRIVACY HELPERS
// ============================================================================

/**
 * Hash a value for use in cache keys without leaking identifiers in logs
 * Uses Web Crypto API SHA-256 for consistent, privacy-preserving hashing
 * @param value - The value to hash (e.g., user_id)
 * @returns Promise<string> - First 16 characters of hex-encoded SHA-256 hash
 */
async function hashForCache(value: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hexHash.slice(0, 16); // Use first 16 chars for brevity
  } catch (error) {
    // Fallback: if crypto is unavailable, use a simple hash
    // This should rarely happen in modern browsers
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, "0").slice(0, 16);
  }
}

// ============================================================================
// FETCH HELPERS
// ============================================================================

/**
 * Fetch with timeout to prevent hanging requests
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000ms = 30s)
 * @returns Promise<Response>
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleProofCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly ttl = 3600000; // 1 hour in milliseconds

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if cache entry is still valid
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  getCacheKey(prefix: string, ...args: string[]): string {
    return `${prefix}:${args.join(":")}`;
  }
}

// ============================================================================
// SIMPLEPROOF SERVICE
// ============================================================================

export class SimpleProofService {
  private readonly timestampEndpoint =
    "/.netlify/functions/simpleproof-timestamp";
  private readonly verifyEndpoint = "/.netlify/functions/simpleproof-verify";
  private readonly enabled: boolean;
  private readonly cache = new SimpleProofCache();
  private readonly logger = createLogger({ component: "simpleProofService" });

  constructor() {
    // Check if SimpleProof is enabled via feature flag (default: false, opt-in)
    this.enabled = clientConfig.flags.simpleproofEnabled || false;

    this.logger.info("SimpleProof service initialized", {
      metadata: { enabled: this.enabled },
    });
  }

  /**
   * Check if SimpleProof is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a new timestamp for data
   * Action: create
   */
  async createTimestamp(
    request: TimestampCreateRequest
  ): Promise<TimestampResult> {
    const context = {
      action: "createTimestamp",
      verificationId: request.verification_id,
      eventType: request.metadata?.eventType,
    };

    if (!this.enabled) {
      this.logger.warn("SimpleProof is disabled", context);
      return {
        success: false,
        ots_proof: "",
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: Math.floor(Date.now() / 1000),
        error:
          "SimpleProof is disabled (feature flag: VITE_SIMPLEPROOF_ENABLED)",
      };
    }

    // Add breadcrumb for tracking
    addSimpleProofBreadcrumb("Creating timestamp", {
      verification_id: request.verification_id,
      event_type: request.metadata?.eventType,
    });

    try {
      return await logOperation(
        "SimpleProof timestamp creation",
        async () => {
          const response = await fetchWithTimeout(this.timestampEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: request.data,
              verification_id: request.verification_id,
              metadata: request.metadata,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `HTTP ${response.status}`;

            this.logger.error(`Timestamp creation failed: ${errorMessage}`, {
              ...context,
              metadata: {
                status: response.status,
                error: errorMessage,
              },
            });

            // Capture error in Sentry
            captureSimpleProofError(
              new Error(`Timestamp creation failed: ${errorMessage}`),
              {
                verificationId: request.verification_id,
                eventType: request.metadata?.eventType,
                component: "simpleProofService",
                action: "createTimestamp",
                metadata: {
                  status: response.status,
                  error: errorMessage,
                },
              }
            );

            return {
              success: false,
              ots_proof: "",
              bitcoin_block: null,
              bitcoin_tx: null,
              verified_at: Math.floor(Date.now() / 1000),
              error: errorMessage,
            };
          }

          const data = await response.json();

          // Cache the result
          const cacheKey = this.cache.getCacheKey(
            "timestamp",
            request.verification_id
          );
          this.cache.set(cacheKey, data);
          logCacheEvent(false, cacheKey, context); // Cache MISS (new entry)

          // Add success breadcrumb
          addSimpleProofBreadcrumb("Timestamp created successfully", {
            verification_id: request.verification_id,
            bitcoin_block: data.bitcoin_block,
          });

          return {
            success: true,
            ...data,
          };
        },
        context
      );
    } catch (error) {
      // Handle errors thrown by logOperation (network errors, JSON parsing errors, etc.)
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Capture error in Sentry
      captureSimpleProofError(
        error instanceof Error ? error : new Error(String(error)),
        {
          verificationId: request.verification_id,
          eventType: request.metadata?.eventType,
          component: "simpleProofService",
          action: "createTimestamp",
          metadata: {
            error_type: "network_error",
          },
        }
      );

      return {
        success: false,
        ots_proof: "",
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: Math.floor(Date.now() / 1000),
        error: errorMessage,
      };
    }
  }

  /**
   * Verify a timestamp proof
   * Action: verify
   */
  async verifyTimestamp(
    request: TimestampVerifyRequest
  ): Promise<VerificationResult> {
    const context = {
      action: "verifyTimestamp",
    };

    if (!this.enabled) {
      this.logger.warn("SimpleProof is disabled", context);
      return {
        success: false,
        is_valid: false,
        bitcoin_block: null,
        bitcoin_tx: null,
        confidence: "unconfirmed",
        verified_at: Math.floor(Date.now() / 1000),
        error:
          "SimpleProof is disabled (feature flag: VITE_SIMPLEPROOF_ENABLED)",
      };
    }

    // Check cache first
    // Use full ots_proof to avoid cache key collisions
    const cacheKey = this.cache.getCacheKey("verify", request.ots_proof);
    const cachedResult = this.cache.get<VerificationResult>(cacheKey);
    if (cachedResult) {
      logCacheEvent(true, cacheKey, context); // Cache HIT
      return {
        ...cachedResult,
        cached: true,
      };
    }

    logCacheEvent(false, cacheKey, context); // Cache MISS

    try {
      return await logOperation(
        "SimpleProof timestamp verification",
        async () => {
          const response = await fetchWithTimeout(this.verifyEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ots_proof: request.ots_proof,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `HTTP ${response.status}`;

            this.logger.error(`Verification failed: ${errorMessage}`, {
              ...context,
              metadata: {
                status: response.status,
                error: errorMessage,
              },
            });

            // Capture error in Sentry
            captureSimpleProofError(
              new Error(`Verification failed: ${errorMessage}`),
              {
                component: "simpleProofService",
                action: "verifyTimestamp",
                metadata: {
                  status: response.status,
                  error: errorMessage,
                },
              }
            );

            return {
              success: false,
              is_valid: false,
              bitcoin_block: null,
              bitcoin_tx: null,
              confidence: "unconfirmed",
              verified_at: Math.floor(Date.now() / 1000),
              error: errorMessage,
            };
          }

          const data = await response.json();

          const result: VerificationResult = {
            success: true,
            cached: false,
            ...data,
          };

          // Cache the result
          this.cache.set(cacheKey, result);

          this.logger.info("Verification completed", {
            ...context,
            metadata: {
              is_valid: result.is_valid,
              confidence: result.confidence,
            },
          });

          return result;
        },
        context
      );
    } catch (error) {
      // Handle errors thrown by logOperation (network errors, etc.)
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Capture error in Sentry
      captureSimpleProofError(
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "simpleProofService",
          action: "verifyTimestamp",
          metadata: {
            error_type: "network_error",
          },
        }
      );

      return {
        success: false,
        is_valid: false,
        bitcoin_block: null,
        bitcoin_tx: null,
        confidence: "unconfirmed",
        verified_at: Math.floor(Date.now() / 1000),
        error: errorMessage,
      };
    }
  }

  /**
   * Locally validate an OpenTimestamps proof against the original data.
   * Uses a browser-safe validator and does NOT perform Bitcoin anchoring checks.
   */
  async validateOtsProofLocally(params: {
    data: string;
    ots_proof: string;
  }): Promise<LocalOtsValidationResult> {
    const { data, ots_proof } = params;
    const context = {
      action: "validateOtsProofLocally",
      provider: "opentimestamps_local" as const,
    };

    try {
      this.logger.info("Starting local OTS proof validation", context);

      const result = await localValidateOtsProof({
        data,
        otsProofHex: ots_proof,
      });

      this.logger.info("Completed local OTS proof validation", {
        ...context,
        metadata: {
          status: result.status,
          reason: result.reason,
        },
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error("Local OTS proof validation failed", {
        ...context,
        metadata: {
          error: errorMessage,
        },
      });

      captureSimpleProofError(
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "simpleProofService",
          action: "validateOtsProofLocally",
          metadata: {
            provider: "opentimestamps_local",
            error: errorMessage,
          },
        }
      );

      return {
        status: "inconclusive",
        provider: "opentimestamps_local",
        reason: errorMessage,
      };
    }
  }

  /**
   * Get timestamp history for a user
   * Action: history
   */
  async getTimestampHistory(
    request: TimestampHistoryRequest
  ): Promise<TimestampHistoryResponse> {
    // PRIVACY: Do NOT log user_id (even if hashed) - not critical for debugging
    const context = {
      action: "getTimestampHistory",
      // userId intentionally omitted for privacy
    };

    if (!this.enabled) {
      this.logger.warn("SimpleProof is disabled", context);
      return {
        success: false,
        timestamps: [],
        total: 0,
        error:
          "SimpleProof is disabled (feature flag: VITE_SIMPLEPROOF_ENABLED)",
      };
    }

    // Check cache first - use hashed user_id to prevent identifier leakage in logs
    const userCacheId = await hashForCache(request.user_id);
    const cacheKey = this.cache.getCacheKey(
      "history",
      userCacheId,
      String(request.limit || 100)
    );
    const cached = this.cache.get<TimestampHistoryResponse>(cacheKey);
    if (cached) {
      logCacheEvent(true, cacheKey, context); // Cache HIT
      return cached;
    }

    try {
      return await logOperation(
        "SimpleProof timestamp history",
        async () => {
          const response = await fetchWithTimeout(this.timestampEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "history",
              user_id: request.user_id,
              limit: request.limit || 100,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `HTTP ${response.status}`;

            this.logger.error(`History fetch failed: ${errorMessage}`, {
              ...context,
              metadata: {
                status: response.status,
                error: errorMessage,
              },
            });

            // Capture error in Sentry
            captureSimpleProofError(
              new Error(`History fetch failed: ${errorMessage}`),
              {
                component: "simpleProofService",
                action: "getTimestampHistory",
                metadata: {
                  status: response.status,
                  error: errorMessage,
                },
              }
            );

            return {
              success: false,
              timestamps: [],
              total: 0,
              error: errorMessage,
            };
          }

          const data = await response.json();

          // Cache the result
          this.cache.set(cacheKey, {
            success: true,
            timestamps: data.timestamps || [],
            total: data.total || 0,
          });
          logCacheEvent(false, cacheKey, context); // Cache MISS (new entry)

          return {
            success: true,
            timestamps: data.timestamps || [],
            total: data.total || 0,
          };
        },
        context
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Capture error in Sentry
      captureSimpleProofError(
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "simpleProofService",
          action: "getTimestampHistory",
          metadata: {
            error_type: "network_error",
          },
        }
      );

      return {
        success: false,
        timestamps: [],
        total: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const simpleProofService = new SimpleProofService();
