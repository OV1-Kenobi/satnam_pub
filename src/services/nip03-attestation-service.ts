/**
 * NIP-03 Attestation Service
 * Phase 2 Week 3 Day 11: API Services for NIP-03 Attestation Management
 *
 * Client-side service for fetching, managing, and verifying NIP-03 attestations.
 * Provides unified interface for attestation operations with caching and error handling.
 *
 * @compliance Privacy-first, zero-knowledge, no PII exposure
 */

import { clientConfig } from "../config/env.client";
import {
  AttestationCacheEntry,
  DownloadOTSProofResponse,
  FetchAttestationResponse,
  GetAttestationStatusResponse,
  NIP03Attestation,
  RetryFailedAttestationResponse,
  VerifyAttestationChainResponse,
} from "../types/attestation";
import { createLogger, logOperation } from "./loggingService";

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 30 * 1000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// LOGGER
// ============================================================================

const logger = createLogger({ component: "NIP03AttestationService" });

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

class AttestationCache {
  private cache: Map<string, AttestationCacheEntry> = new Map();

  set(key: string, attestation: NIP03Attestation): void {
    const now = Date.now();
    this.cache.set(key, {
      attestation,
      cachedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    });
  }

  get(key: string): NIP03Attestation | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.attestation;
  }

  clear(): void {
    this.cache.clear();
  }
}

const attestationCache = new AttestationCache();

// ============================================================================
// FETCH HELPERS
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
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
    throw error;
  }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastError;
}

// ============================================================================
// SERVICE METHODS
// ============================================================================

/**
 * Fetch attestation by user ID
 */
export async function fetchAttestationByUserId(
  userId: string
): Promise<FetchAttestationResponse> {
  const cacheKey = `user:${userId}`;
  const cached = attestationCache.get(cacheKey);

  if (cached) {
    logger.debug("Returning cached attestation", { metadata: { userId } });
    return { success: true, attestation: cached };
  }

  try {
    const response = await logOperation(
      "fetch_attestation_by_user",
      async () => {
        return await retryWithBackoff(async () => {
          return await fetchWithTimeout(
            `/api/attestation/nip03/get?userId=${encodeURIComponent(userId)}`
          );
        });
      },
      { metadata: { userId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as FetchAttestationResponse;

    if (data.success && data.attestation) {
      attestationCache.set(cacheKey, data.attestation);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to fetch attestation by user ID", {
      metadata: { userId, error: message },
    });
    return {
      success: false,
      error: `Failed to fetch attestation: ${message}`,
    };
  }
}

/**
 * Fetch attestation by Kind:0 event ID
 */
export async function fetchAttestationByEventId(
  eventId: string
): Promise<FetchAttestationResponse> {
  const cacheKey = `event:${eventId}`;
  const cached = attestationCache.get(cacheKey);

  if (cached) {
    logger.debug("Returning cached attestation", { metadata: { eventId } });
    return { success: true, attestation: cached };
  }

  try {
    const response = await logOperation(
      "fetch_attestation_by_event",
      async () => {
        return await retryWithBackoff(async () => {
          return await fetchWithTimeout(
            `/api/attestation/nip03/get?eventId=${encodeURIComponent(eventId)}`
          );
        });
      },
      { metadata: { eventId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as FetchAttestationResponse;

    if (data.success && data.attestation) {
      attestationCache.set(cacheKey, data.attestation);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to fetch attestation by event ID", {
      metadata: { eventId, error: message },
    });
    return {
      success: false,
      error: `Failed to fetch attestation: ${message}`,
    };
  }
}

/**
 * Verify complete attestation chain
 */
export async function verifyAttestationChain(
  attestationId: string
): Promise<VerifyAttestationChainResponse> {
  try {
    const response = await logOperation(
      "verify_attestation_chain",
      async () => {
        return await retryWithBackoff(async () => {
          return await fetchWithTimeout(
            `/api/attestation/nip03/verify?attestationId=${encodeURIComponent(
              attestationId
            )}`
          );
        });
      },
      { metadata: { attestationId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as VerifyAttestationChainResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to verify attestation chain", {
      metadata: { attestationId, error: message },
    });
    return {
      success: false,
      isValid: false,
      kind0Valid: false,
      simpleproofValid: false,
      nip03Valid: false,
      pkarrValid: false,
      verifiedAt: 0,
      error: `Failed to verify attestation: ${message}`,
    };
  }
}

/**
 * Download OTS proof file
 */
export async function downloadOTSProof(
  attestationId: string
): Promise<DownloadOTSProofResponse> {
  try {
    const response = await logOperation(
      "download_ots_proof",
      async () => {
        return await retryWithBackoff(async () => {
          return await fetchWithTimeout(
            `/api/attestation/nip03/download-proof?attestationId=${encodeURIComponent(
              attestationId
            )}`
          );
        });
      },
      { metadata: { attestationId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as DownloadOTSProofResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to download OTS proof", {
      metadata: { attestationId, error: message },
    });
    return {
      success: false,
      proof: "",
      filename: "",
      error: `Failed to download proof: ${message}`,
    };
  }
}

/**
 * Get current attestation status
 */
export async function getAttestationStatus(
  attestationId: string
): Promise<GetAttestationStatusResponse> {
  try {
    const response = await logOperation(
      "get_attestation_status",
      async () => {
        return await fetchWithTimeout(
          `/api/attestation/nip03/status?attestationId=${encodeURIComponent(
            attestationId
          )}`
        );
      },
      { metadata: { attestationId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as GetAttestationStatusResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get attestation status", {
      metadata: { attestationId, error: message },
    });
    return {
      success: false,
      status: "failure",
      error: `Failed to get status: ${message}`,
    };
  }
}

/**
 * Retry failed attestation
 */
export async function retryFailedAttestation(
  attestationId: string
): Promise<RetryFailedAttestationResponse> {
  try {
    const response = await logOperation(
      "retry_failed_attestation",
      async () => {
        return await fetchWithTimeout(`/api/attestation/nip03/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attestationId }),
        });
      },
      { metadata: { attestationId } }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as RetryFailedAttestationResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to retry attestation", {
      metadata: { attestationId, error: message },
    });
    return {
      success: false,
      status: "failure",
      error: `Failed to retry attestation: ${message}`,
    };
  }
}

/**
 * Clear attestation cache
 */
export function clearAttestationCache(): void {
  attestationCache.clear();
  logger.debug("Attestation cache cleared");
}

/**
 * Check if NIP-03 attestation is enabled
 */
export function isNIP03AttestationEnabled(): boolean {
  return (
    clientConfig.flags.nip03Enabled &&
    clientConfig.flags.nip03IdentityCreationEnabled &&
    clientConfig.flags.simpleproofEnabled
  );
}
