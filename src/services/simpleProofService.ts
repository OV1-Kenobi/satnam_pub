/**
 * SimpleProof Service
 * Phase 2B-2 Day 8: SimpleProof Integration
 *
 * Provides client-side wrapper around simpleproof-timestamp and simpleproof-verify
 * endpoints for blockchain-based proof of existence and timestamp verification.
 *
 * Feature Flag: VITE_SIMPLEPROOF_ENABLED (default: false, opt-in)
 */

import { clientConfig } from "../config/env.client";

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
  private readonly timestampEndpoint = "/.netlify/functions/simpleproof-timestamp";
  private readonly verifyEndpoint = "/.netlify/functions/simpleproof-verify";
  private readonly enabled: boolean;
  private readonly cache = new SimpleProofCache();

  constructor() {
    // Check if SimpleProof is enabled via feature flag (default: false, opt-in)
    this.enabled = clientConfig.flags.simpleproofEnabled || false;
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
    if (!this.enabled) {
      return {
        success: false,
        ots_proof: "",
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: Math.floor(Date.now() / 1000),
        error: "SimpleProof is disabled (feature flag: VITE_SIMPLEPROOF_ENABLED)",
      };
    }

    try {
      const response = await fetch(this.timestampEndpoint, {
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
        return {
          success: false,
          ots_proof: "",
          bitcoin_block: null,
          bitcoin_tx: null,
          verified_at: Math.floor(Date.now() / 1000),
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      
      // Cache the result
      const cacheKey = this.cache.getCacheKey("timestamp", request.verification_id);
      this.cache.set(cacheKey, data);

      return {
        success: true,
        ...data,
      };
    } catch (error) {
      console.error("SimpleProof timestamp creation error:", error);
      return {
        success: false,
        ots_proof: "",
        bitcoin_block: null,
        bitcoin_tx: null,
        verified_at: Math.floor(Date.now() / 1000),
        error: error instanceof Error ? error.message : "Unknown error",
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
    if (!this.enabled) {
      return {
        success: false,
        is_valid: false,
        bitcoin_block: null,
        bitcoin_tx: null,
        confidence: "unconfirmed",
        verified_at: Math.floor(Date.now() / 1000),
        error: "SimpleProof is disabled (feature flag: VITE_SIMPLEPROOF_ENABLED)",
      };
    }

    // Check cache first
    const cacheKey = this.cache.getCacheKey("verify", request.ots_proof.substring(0, 32));
    const cachedResult = this.cache.get<VerificationResult>(cacheKey);
    if (cachedResult) {
      return {
        ...cachedResult,
        cached: true,
      };
    }

    try {
      const response = await fetch(this.verifyEndpoint, {
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
        return {
          success: false,
          is_valid: false,
          bitcoin_block: null,
          bitcoin_tx: null,
          confidence: "unconfirmed",
          verified_at: Math.floor(Date.now() / 1000),
          error: errorData.error || `HTTP ${response.status}`,
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

      return result;
    } catch (error) {
      console.error("SimpleProof verification error:", error);
      return {
        success: false,
        is_valid: false,
        bitcoin_block: null,
        bitcoin_tx: null,
        confidence: "unconfirmed",
        verified_at: Math.floor(Date.now() / 1000),
        error: error instanceof Error ? error.message : "Unknown error",
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

