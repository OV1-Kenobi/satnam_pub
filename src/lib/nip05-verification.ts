/**
 * NIP-05 Verification System
 * Implements proper NIP-05 verification for Nostr identifiers
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

// Removed invalid import of non-existent module "./nostr-browser"

// Phase 1: Import CEPS for kind:0 resolution
import { CentralEventPublishingService } from "../../lib/central_event_publishing_service";
// Note: PubkyDHTClient is imported dynamically in tryPkarrResolution() to avoid bundling server-side code

// Import domain resolver for white-label compatibility
import { resolvePlatformLightningDomain } from "../config/domain.client";

export interface NIP05VerificationResult {
  verified: boolean;
  pubkey?: string;
  error?: string;
  verification_timestamp: number;
  dns_records?: string[];
  response_time_ms: number;
}

export interface NIP05VerificationRequest {
  identifier: string; // e.g., "alice@satnam.pub"
  expected_pubkey?: string; // Optional: verify against specific pubkey
  timeout_ms?: number; // Default: 5000ms
}

export interface NIP05VerificationConfig {
  default_timeout_ms: number;
  max_retries: number;
  retry_delay_ms: number;
  cache_duration_ms: number;
  allowed_domains?: string[]; // Whitelist for security
  blocked_domains?: string[]; // Blacklist for security
}

/**
 * NIP-05 Verification Service
 * Handles proper NIP-05 verification according to NIP-05 specification
 */
export class NIP05VerificationService {
  private config: NIP05VerificationConfig;
  private verificationCache: Map<string, NIP05VerificationResult> = new Map();

  constructor(config?: Partial<NIP05VerificationConfig>) {
    // Get platform domain for white-label compatibility
    const platformDomain = resolvePlatformLightningDomain();

    // Build allowed domains list with platform domain first
    const allowedDomains = [
      platformDomain, // Platform's primary domain (e.g., my.satnam.pub)
      "satnam.pub",
      "citadel.academy",
      "nostr.com",
      "damus.io",
      "snort.social",
      "iris.to",
      "primal.net",
      "relayable.org",
      "nostrplebs.com",
      "nostr.wine",
      "nostr.land",
      "nostr.band",
      "nostr.directory",
      "nostr.zone",
      "nostr.network",
      "nostr.world",
      "nostr.space",
      "nostr.tech",
      "nostr.dev",
      "nostr.org",
    ];

    this.config = {
      default_timeout_ms: 5000,
      max_retries: 3,
      retry_delay_ms: 1000,
      cache_duration_ms: 300000, // 5 minutes
      allowed_domains: [...new Set(allowedDomains)], // Remove duplicates
      blocked_domains: ["malicious.example.com", "phishing.example.com"],
      ...config,
    };
  }

  /**
   * Verify a NIP-05 identifier
   */
  async verifyNIP05(
    request: NIP05VerificationRequest
  ): Promise<NIP05VerificationResult> {
    const startTime = Date.now();

    try {
      // Validate identifier format
      const validation = this.validateIdentifier(request.identifier);
      if (!validation.valid) {
        return {
          verified: false,
          error: validation.error,
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Check cache first
      const cached = this.getCachedVerification(request.identifier);
      if (cached) {
        return {
          ...cached,
          response_time_ms: Date.now() - startTime,
        };
      }

      // Check domain security
      const domainCheck = this.checkDomainSecurity(validation.domain!);
      if (!domainCheck.allowed) {
        return {
          verified: false,
          error: `Domain ${validation.domain} is not allowed`,
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Perform NIP-05 verification
      const result = await this.performNIP05Verification(request, {
        domain: validation.domain!,
        username: validation.username!,
      });

      // Cache the result
      this.cacheVerification(request.identifier, result);

      return {
        ...result,
        response_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      console.error("NIP-05 verification error:", error);
      return {
        verified: false,
        error:
          error instanceof Error ? error.message : "Unknown verification error",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate NIP-05 identifier format
   */
  private validateIdentifier(identifier: string): {
    valid: boolean;
    error?: string;
    domain?: string;
    username?: string;
  } {
    // Check basic format: username@domain
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
    const match = identifier.match(nip05Regex);

    if (!match) {
      return {
        valid: false,
        error: "Invalid NIP-05 format. Must be username@domain",
      };
    }

    const [, username, domain] = match;

    // Validate username
    if (username.length < 1 || username.length > 64) {
      return {
        valid: false,
        error: "Username must be between 1 and 64 characters",
      };
    }

    // Validate domain
    if (domain.length < 4 || domain.length > 253) {
      return {
        valid: false,
        error: "Domain must be between 4 and 253 characters",
      };
    }

    // Check for valid TLD
    const tldRegex = /\.[a-zA-Z]{2,}$/;
    if (!tldRegex.test(domain)) {
      return {
        valid: false,
        error: "Domain must have a valid top-level domain",
      };
    }

    return {
      valid: true,
      domain,
      username,
    };
  }

  /**
   * Check domain security (whitelist/blacklist)
   */
  private checkDomainSecurity(domain: string): {
    allowed: boolean;
    reason?: string;
  } {
    // Check blacklist first
    if (this.config.blocked_domains?.includes(domain)) {
      return {
        allowed: false,
        reason: "Domain is blacklisted",
      };
    }

    // Check whitelist if configured
    if (this.config.allowed_domains && this.config.allowed_domains.length > 0) {
      const isAllowed = this.config.allowed_domains.some((allowedDomain) => {
        // Exact match
        if (domain === allowedDomain) return true;

        // Wildcard subdomain match (e.g., *.satnam.pub)
        if (allowedDomain.startsWith("*.")) {
          const baseDomain = allowedDomain.slice(2);
          return domain === baseDomain || domain.endsWith("." + baseDomain);
        }

        return false;
      });

      if (!isAllowed) {
        return {
          allowed: false,
          reason: "Domain not in allowed list",
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Perform actual NIP-05 verification using direct fetch of /.well-known/nostr.json
   * Avoids direct nostr-tools imports and works in both browser and Node (Netlify Functions)
   */
  private async performNIP05Verification(
    request: NIP05VerificationRequest,
    validation: { domain: string; username: string }
  ): Promise<NIP05VerificationResult> {
    const timeout = request.timeout_ms || this.config.default_timeout_ms;
    const domain = validation.domain;
    const username = validation.username;

    // Helper to fetch with timeout
    const fetchWithTimeout = async (
      url: string,
      ms: number
    ): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        return res;
      } finally {
        clearTimeout(timer);
      }
    };

    // Attempt verification with retries
    for (let attempt = 1; attempt <= this.config.max_retries; attempt++) {
      try {
        // Try several URL/lookup strategies for better compatibility
        const candidates: Array<{ url: string; key: string }> = [];
        const userLower = username.toLowerCase();

        // Preferred: query param 'name='
        candidates.push({
          url: `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
            username
          )}`,
          key: username,
        });
        if (userLower !== username)
          candidates.push({
            url: `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
              userLower
            )}`,
            key: userLower,
          });
        // Fallback: fetch full mapping and check locally
        candidates.push({
          url: `https://${domain}/.well-known/nostr.json`,
          key: username,
        });
        if (userLower !== username)
          candidates.push({
            url: `https://${domain}/.well-known/nostr.json`,
            key: userLower,
          });

        let resolvedPubkey: string | null = null;
        let lastError: string | undefined;

        for (const c of candidates) {
          try {
            const res = await fetchWithTimeout(c.url, timeout);
            if (!res.ok) {
              lastError = `HTTP ${res.status}`;
              continue;
            }
            const data = (await res.json()) as {
              names?: Record<string, string>;
            };
            const pk = data?.names?.[c.key];
            if (pk && typeof pk === "string") {
              // Basic sanity: 64-char hex
              const isHex64 = /^[0-9a-fA-F]{64}$/.test(pk);
              if (isHex64) {
                resolvedPubkey = pk.toLowerCase();
                break;
              }
              lastError = "Invalid pubkey format in nostr.json";
            } else {
              lastError = "Username not found in nostr.json";
            }
          } catch (e) {
            lastError = e instanceof Error ? e.message : "Fetch error";
            // Try next candidate URL
          }
        }

        if (!resolvedPubkey) {
          throw new Error(lastError || "No matching NIP-05 record found");
        }

        // Verify against expected pubkey if provided
        if (
          request.expected_pubkey &&
          resolvedPubkey !== request.expected_pubkey.toLowerCase()
        ) {
          return {
            verified: false,
            error: `NIP-05 verification failed: expected ${request.expected_pubkey}, got ${resolvedPubkey}`,
            verification_timestamp: Math.floor(Date.now() / 1000),
            response_time_ms: 0,
          };
        }

        return {
          verified: true,
          pubkey: resolvedPubkey,
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: 0,
        };
      } catch (error) {
        console.warn(`NIP-05 verification attempt ${attempt} failed:`, error);
        if (attempt === this.config.max_retries) {
          throw error instanceof Error
            ? error
            : new Error("Verification failed");
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retry_delay_ms)
        );
      }
    }

    throw new Error("All verification attempts failed");
  }

  /**
   * Get cached verification result
   */
  private getCachedVerification(
    identifier: string
  ): NIP05VerificationResult | null {
    const cached = this.verificationCache.get(identifier);
    if (!cached) return null;

    const now = Date.now();
    const cacheAge = now - cached.verification_timestamp * 1000;

    if (cacheAge > this.config.cache_duration_ms) {
      this.verificationCache.delete(identifier);
      return null;
    }

    return cached;
  }

  /**
   * Cache verification result
   */
  private cacheVerification(
    identifier: string,
    result: NIP05VerificationResult
  ): void {
    this.verificationCache.set(identifier, result);

    // Clean up old cache entries
    this.cleanupCache();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const maxAge = this.config.cache_duration_ms;

    for (const [identifier, result] of this.verificationCache.entries()) {
      const cacheAge = now - result.verification_timestamp * 1000;
      if (cacheAge > maxAge) {
        this.verificationCache.delete(identifier);
      }
    }
  }

  /**
   * Batch verify multiple NIP-05 identifiers
   */
  async batchVerifyNIP05(
    identifiers: string[]
  ): Promise<Map<string, NIP05VerificationResult>> {
    const results = new Map<string, NIP05VerificationResult>();

    // Process in parallel with concurrency limit
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(identifiers, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (identifier) => {
        const result = await this.verifyNIP05({ identifier });
        return { identifier, result };
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const chunkResult of chunkResults) {
        if (chunkResult.status === "fulfilled") {
          results.set(chunkResult.value.identifier, chunkResult.value.result);
        } else {
          console.error(
            "Batch verification failed for identifier:",
            chunkResult.reason
          );
        }
      }
    }

    return results;
  }

  /**
   * Verify mentor NIP-05 for credentialization system
   */
  async verifyMentorNIP05(
    mentorPubkey: string,
    nip05Identifier: string
  ): Promise<{ verified: boolean; error?: string; verification_data?: any }> {
    try {
      const result = await this.verifyNIP05({
        identifier: nip05Identifier,
        expected_pubkey: mentorPubkey,
        timeout_ms: 10000, // Longer timeout for mentor verification
      });

      if (!result.verified) {
        return {
          verified: false,
          error: result.error || "NIP-05 verification failed",
        };
      }

      // Additional mentor-specific verification
      const verificationData = {
        mentor_pubkey: mentorPubkey,
        nip05_identifier: nip05Identifier,
        verification_timestamp: result.verification_timestamp,
        response_time_ms: result.response_time_ms,
        dns_records: result.dns_records,
      };

      return {
        verified: true,
        verification_data: verificationData,
      };
    } catch (error) {
      console.error("Mentor NIP-05 verification error:", error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  /**
   * Get NIP-05 verification status for a pubkey
   */
  async getNIP05Status(
    pubkey: string
  ): Promise<{ has_nip05: boolean; identifier?: string; verified?: boolean }> {
    try {
      // This would require querying Nostr relays for NIP-05 events
      // For now, return basic status
      return {
        has_nip05: false, // Would be determined by querying relays
      };
    } catch (error) {
      console.error("Error getting NIP-05 status:", error);
      return {
        has_nip05: false,
      };
    }
  }

  /**
   * Utility: Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxAge: number } {
    return {
      size: this.verificationCache.size,
      maxAge: this.config.cache_duration_ms,
    };
  }
}

// Export singleton instance
export const nip05VerificationService = new NIP05VerificationService();

// Export utility functions
export const nip05Utils = {
  /**
   * Quick NIP-05 verification
   */
  async verify(
    identifier: string,
    expectedPubkey?: string
  ): Promise<NIP05VerificationResult> {
    return nip05VerificationService.verifyNIP05({
      identifier,
      expected_pubkey: expectedPubkey,
    });
  },

  /**
   * Verify mentor NIP-05
   */
  async verifyMentor(mentorPubkey: string, nip05Identifier: string) {
    return nip05VerificationService.verifyMentorNIP05(
      mentorPubkey,
      nip05Identifier
    );
  },

  /**
   * Validate NIP-05 format
   */
  validateFormat(identifier: string): boolean {
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
    return nip05Regex.test(identifier);
  },

  /**
   * Extract domain from NIP-05 identifier
   */
  extractDomain(identifier: string): string | null {
    const match = identifier.match(/^[^@]+@(.+)$/);
    return match ? match[1] : null;
  },

  /**
   * Extract username from NIP-05 identifier
   */
  extractUsername(identifier: string): string | null {
    const match = identifier.match(/^([^@]+)@.+$/);
    return match ? match[1] : null;
  },
};

/**
 * Single method verification result
 * Phase 1 Week 4: Multi-method verification with progressive trust
 * Phase 2B-2 Week 2: Added Iroh as optional 5th verification method
 */
export interface MethodVerificationResult {
  method: "kind:0" | "pkarr" | "dns" | "iroh";
  verified: boolean;
  pubkey?: string;
  nip05?: string;
  name?: string;
  picture?: string;
  about?: string;
  error?: string;
  response_time_ms: number;
  timestamp?: number;
  metadata?: any; // Method-specific metadata (e.g., Iroh node info)
}

/**
 * Hybrid NIP-05 Verifier Result
 * Phase 1 Week 4: Includes multi-method results and trust score
 * Phase 2B-2 Week 2: Added Iroh as optional 5th verification method
 */
export interface HybridVerificationResult {
  verified: boolean;
  pubkey?: string;
  nip05?: string;
  name?: string;
  picture?: string;
  about?: string;
  verificationMethod: "kind:0" | "pkarr" | "dns" | "iroh" | "none";
  error?: string;
  verification_timestamp: number;
  response_time_ms: number;
  // Phase 1 Week 4: Multi-method verification fields
  multiMethodResults?: MethodVerificationResult[];
  trustScore?: number; // 0-100: 100 = all methods agree, 0 = all failed
  trustLevel?: "high" | "medium" | "low" | "none"; // Based on method agreement
  methodAgreement?: {
    kind0?: boolean;
    pkarr?: boolean;
    dns?: boolean;
    iroh?: boolean; // Phase 2B-2 Week 2: Iroh node reachability
    agreementCount?: number; // How many methods agree
  };
}

export interface HybridVerificationConfig extends NIP05VerificationConfig {
  enableKind0Resolution?: boolean;
  enablePkarrResolution?: boolean;
  enableDnsResolution?: boolean;
  kind0Timeout?: number;
  pkarrTimeout?: number;
  // Phase 1 Week 4: Multi-method verification config
  enableMultiMethodVerification?: boolean;
  requireMinimumTrustLevel?: "high" | "medium" | "low" | "none";
  // Phase 2B-2 Week 2: Iroh integration (optional 5th verification method)
  enableIrohDiscovery?: boolean;
  irohTimeout?: number;
}

export class HybridNIP05Verifier {
  private config: HybridVerificationConfig;
  private verificationCache: Map<string, HybridVerificationResult> = new Map();
  private dnsVerifier: NIP05VerificationService;

  constructor(config?: Partial<HybridVerificationConfig>) {
    this.config = {
      default_timeout_ms: 5000,
      max_retries: 3,
      retry_delay_ms: 1000,
      cache_duration_ms: 300000, // 5 minutes
      enableKind0Resolution: true,
      enablePkarrResolution: true,
      enableDnsResolution: true,
      kind0Timeout: 3000,
      pkarrTimeout: 3000,
      // Phase 1 Week 4: Multi-method verification
      enableMultiMethodVerification: false, // Disabled by default, enable via feature flag
      requireMinimumTrustLevel: "none", // No minimum trust level by default
      // Phase 2B-2 Week 2: Iroh integration (optional 5th verification method)
      enableIrohDiscovery: false, // Disabled by default, opt-in via VITE_IROH_ENABLED
      irohTimeout: 10000, // 10 seconds (DHT lookups can be slow)
      ...config,
    };
    this.dnsVerifier = new NIP05VerificationService(config);
  }

  /**
   * Verify identity using hybrid method
   * Phase 1 Week 4: Supports both fallback chain and parallel multi-method verification
   *
   * If enableMultiMethodVerification is true:
   *   - Executes all methods in parallel
   *   - Calculates trust score based on method agreement
   *   - Returns results from all methods
   *
   * If enableMultiMethodVerification is false (default):
   *   - Uses original fallback chain: kind:0 → PKARR → DNS
   *   - Stops at first successful method
   */
  async verifyHybrid(
    identifier: string,
    expectedPubkey?: string
  ): Promise<HybridVerificationResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cached = this.getCachedVerification(identifier);
      if (cached) {
        return {
          ...cached,
          response_time_ms: Date.now() - startTime,
        };
      }

      // Phase 1 Week 4: Use multi-method verification if enabled
      if (this.config.enableMultiMethodVerification) {
        return await this.verifyHybridMultiMethod(
          identifier,
          expectedPubkey,
          startTime
        );
      }

      // Original fallback chain behavior
      return await this.verifyHybridFallbackChain(
        identifier,
        expectedPubkey,
        startTime
      );
    } catch (error) {
      return {
        verified: false,
        verificationMethod: "none",
        error: error instanceof Error ? error.message : "Verification failed",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Phase 1 Week 4: Parallel multi-method verification with trust scoring
   */
  private async verifyHybridMultiMethod(
    identifier: string,
    expectedPubkey: string | undefined,
    startTime: number
  ): Promise<HybridVerificationResult> {
    const methodResults: MethodVerificationResult[] = [];

    // Execute all methods in parallel
    const promises: Promise<MethodVerificationResult | null>[] = [];

    if (this.config.enableKind0Resolution && expectedPubkey) {
      promises.push(
        this.tryKind0ResolutionMultiMethod(expectedPubkey, identifier)
      );
    }

    if (this.config.enablePkarrResolution && expectedPubkey) {
      promises.push(
        this.tryPkarrResolutionMultiMethod(expectedPubkey, identifier)
      );
    }

    if (this.config.enableDnsResolution) {
      promises.push(this.tryDnsResolutionMultiMethod(identifier));
    }

    // Phase 2B-2 Week 2: Add Iroh discovery as optional 5th verification method
    if (this.config.enableIrohDiscovery && expectedPubkey) {
      promises.push(
        this.tryIrohDiscoveryMultiMethod(expectedPubkey, identifier)
      );
    }

    // Wait for all methods to complete
    const results = await Promise.allSettled(promises);

    // Collect results
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        methodResults.push(result.value);
      }
    }

    // Calculate trust score and agreement
    const { trustScore, trustLevel, methodAgreement, primaryResult } =
      this.calculateTrustScore(methodResults, identifier);

    // Determine overall verification status
    const verified =
      trustLevel !== "none" &&
      (this.config.requireMinimumTrustLevel === "none" ||
        this.meetsMinimumTrustLevel(trustLevel));

    // Cache the result
    const result: HybridVerificationResult = {
      verified,
      pubkey: primaryResult?.pubkey,
      nip05: primaryResult?.nip05,
      name: primaryResult?.name,
      picture: primaryResult?.picture,
      about: primaryResult?.about,
      verificationMethod: primaryResult?.method || "none",
      error: verified
        ? undefined
        : "Verification failed or trust level too low",
      verification_timestamp: Math.floor(Date.now() / 1000),
      response_time_ms: Date.now() - startTime,
      multiMethodResults: methodResults,
      trustScore,
      trustLevel,
      methodAgreement,
    };

    this.cacheVerification(identifier, result);
    return result;
  }

  /**
   * Original fallback chain verification (backward compatible)
   */
  private async verifyHybridFallbackChain(
    identifier: string,
    expectedPubkey: string | undefined,
    startTime: number
  ): Promise<HybridVerificationResult> {
    // Try kind:0 resolution first (if enabled)
    if (this.config.enableKind0Resolution && expectedPubkey) {
      const kind0Result = await this.tryKind0Resolution(
        expectedPubkey,
        identifier
      );
      if (kind0Result.verified) {
        this.cacheVerification(identifier, kind0Result);
        return {
          ...kind0Result,
          response_time_ms: Date.now() - startTime,
        };
      }
    }

    // Try PKARR resolution (if enabled)
    if (this.config.enablePkarrResolution && expectedPubkey) {
      const pkarrResult = await this.tryPkarrResolution(
        expectedPubkey,
        identifier
      );
      if (pkarrResult.verified) {
        this.cacheVerification(identifier, pkarrResult);
        return {
          ...pkarrResult,
          response_time_ms: Date.now() - startTime,
        };
      }
    }

    // Fall back to DNS resolution (if enabled)
    if (this.config.enableDnsResolution) {
      const dnsResult = await this.tryDnsResolution(identifier);
      if (dnsResult.verified) {
        this.cacheVerification(identifier, dnsResult);
        return {
          ...dnsResult,
          response_time_ms: Date.now() - startTime,
        };
      }
    }

    // All methods failed
    return {
      verified: false,
      verificationMethod: "none",
      error: "All verification methods failed",
      verification_timestamp: Math.floor(Date.now() / 1000),
      response_time_ms: Date.now() - startTime,
    };
  }

  /**
   * Try kind:0 metadata resolution
   * Phase 1: Resolve identity from Nostr kind:0 metadata events
   */
  private async tryKind0Resolution(
    pubkey: string,
    identifier: string
  ): Promise<HybridVerificationResult> {
    const startTime = Date.now();
    try {
      // Create CEPS instance for kind:0 resolution
      const ceps = new CentralEventPublishingService();

      // Create timeout promise
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.kind0Timeout || 3000);
      });

      // Race between resolution and timeout
      const kind0Result = await Promise.race([
        ceps.resolveIdentityFromKind0(pubkey),
        timeoutPromise,
      ]);

      // Handle timeout
      if (!kind0Result) {
        return {
          verified: false,
          verificationMethod: "kind:0",
          error: "kind:0 resolution timeout",
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Handle resolution failure
      if (!kind0Result.success) {
        return {
          verified: false,
          verificationMethod: "kind:0",
          error: kind0Result.error || "kind:0 resolution failed",
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Verify NIP-05 matches identifier if provided
      if (kind0Result.nip05 && identifier) {
        const identifierMatch =
          kind0Result.nip05.toLowerCase() === identifier.toLowerCase();
        if (!identifierMatch) {
          return {
            verified: false,
            verificationMethod: "kind:0",
            error: "NIP-05 mismatch: kind:0 metadata does not match identifier",
            verification_timestamp: Math.floor(Date.now() / 1000),
            response_time_ms: Date.now() - startTime,
          };
        }
      }

      // Successful verification
      return {
        verified: true,
        pubkey,
        nip05: kind0Result.nip05,
        name: kind0Result.name,
        picture: kind0Result.picture,
        about: kind0Result.about,
        verificationMethod: "kind:0",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        verified: false,
        verificationMethod: "kind:0",
        error:
          error instanceof Error ? error.message : "kind:0 resolution failed",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Try PKARR resolution
   * Phase 1: Resolve identity from BitTorrent DHT PKARR records
   */
  private async tryPkarrResolution(
    pubkey: string,
    identifier: string
  ): Promise<HybridVerificationResult> {
    const startTime = Date.now();
    try {
      // Dynamically import PubkyDHTClient to avoid bundling server-side code
      const { PubkyDHTClient } = await import(
        "../../lib/pubky-enhanced-client"
      );

      // Create PubkyDHTClient instance for PKARR resolution
      const dhtClient = new PubkyDHTClient(
        ["https://pkarr.relay.pubky.tech", "https://pkarr.relay.synonym.to"],
        3600000, // 1 hour cache TTL
        this.config.pkarrTimeout || 3000, // timeout
        false // debug
      );

      // Create timeout promise
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.pkarrTimeout || 3000);
      });

      // Race between resolution and timeout
      const pkarrRecord = await Promise.race([
        dhtClient.resolveRecord(pubkey),
        timeoutPromise,
      ]);

      // Handle timeout
      if (!pkarrRecord) {
        return {
          verified: false,
          verificationMethod: "pkarr",
          error: "PKARR resolution timeout",
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Parse PKARR records to find NIP-05 or identity information
      let nip05: string | undefined;
      let resolvedPubkey: string | undefined;

      for (const record of pkarrRecord.records) {
        // Look for TXT records containing NIP-05 or identity info
        if (record.type === "TXT") {
          try {
            const parsed = JSON.parse(record.value);
            if (parsed.nip05) nip05 = parsed.nip05;
            if (parsed.pubkey) resolvedPubkey = parsed.pubkey;
          } catch {
            // Not JSON, try direct NIP-05 format
            if (record.value.includes("@")) {
              nip05 = record.value;
            }
          }
        }
      }

      // Verify NIP-05 matches identifier if found
      if (nip05 && identifier) {
        const identifierMatch =
          nip05.toLowerCase() === identifier.toLowerCase();
        if (!identifierMatch) {
          return {
            verified: false,
            verificationMethod: "pkarr",
            error: "NIP-05 mismatch: PKARR record does not match identifier",
            verification_timestamp: Math.floor(Date.now() / 1000),
            response_time_ms: Date.now() - startTime,
          };
        }
      }

      // Verify pubkey matches if found
      if (resolvedPubkey && resolvedPubkey !== pubkey) {
        return {
          verified: false,
          verificationMethod: "pkarr",
          error: "Pubkey mismatch: PKARR record pubkey does not match",
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime,
        };
      }

      // Successful verification
      return {
        verified: true,
        pubkey,
        nip05,
        verificationMethod: "pkarr",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        verified: false,
        verificationMethod: "pkarr",
        error:
          error instanceof Error ? error.message : "PKARR resolution failed",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Try DNS resolution (fallback)
   * Phase 1: Fallback to traditional DNS-based NIP-05 verification
   */
  private async tryDnsResolution(
    identifier: string
  ): Promise<HybridVerificationResult> {
    const startTime = Date.now();
    try {
      // Create timeout promise for DNS resolution
      const timeoutPromise = new Promise<NIP05VerificationResult>((resolve) => {
        setTimeout(() => {
          resolve({
            verified: false,
            error: "DNS resolution timeout",
            verification_timestamp: Math.floor(Date.now() / 1000),
            response_time_ms: Date.now() - startTime,
          });
        }, this.config.default_timeout_ms || 5000);
      });

      // Race between DNS verification and timeout
      const dnsResult = await Promise.race([
        this.dnsVerifier.verifyNIP05({
          identifier,
          timeout_ms: this.config.default_timeout_ms,
        }),
        timeoutPromise,
      ]);

      // Map DNS verification result to hybrid result
      return {
        verified: dnsResult.verified,
        pubkey: dnsResult.pubkey,
        nip05: identifier,
        verificationMethod: "dns",
        error: dnsResult.error,
        verification_timestamp: dnsResult.verification_timestamp,
        response_time_ms: dnsResult.response_time_ms,
      };
    } catch (error) {
      return {
        verified: false,
        verificationMethod: "dns",
        error: error instanceof Error ? error.message : "DNS resolution failed",
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Phase 1 Week 4: Multi-method version of kind:0 resolution
   * Returns MethodVerificationResult instead of HybridVerificationResult
   */
  private async tryKind0ResolutionMultiMethod(
    pubkey: string,
    identifier: string
  ): Promise<MethodVerificationResult | null> {
    const startTime = Date.now();
    try {
      const ceps = new CentralEventPublishingService();
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.kind0Timeout || 3000);
      });

      const kind0Result = await Promise.race([
        ceps.resolveIdentityFromKind0(pubkey),
        timeoutPromise,
      ]);

      if (!kind0Result) {
        return {
          method: "kind:0",
          verified: false,
          error: "kind:0 resolution timeout",
          response_time_ms: Date.now() - startTime,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }

      if (!kind0Result.success) {
        return {
          method: "kind:0",
          verified: false,
          error: kind0Result.error || "kind:0 resolution failed",
          response_time_ms: Date.now() - startTime,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }

      if (kind0Result.nip05 && identifier) {
        const identifierMatch =
          kind0Result.nip05.toLowerCase() === identifier.toLowerCase();
        if (!identifierMatch) {
          return {
            method: "kind:0",
            verified: false,
            error: "NIP-05 mismatch",
            response_time_ms: Date.now() - startTime,
            timestamp: Math.floor(Date.now() / 1000),
          };
        }
      }

      return {
        method: "kind:0",
        verified: true,
        pubkey,
        nip05: kind0Result.nip05,
        name: kind0Result.name,
        picture: kind0Result.picture,
        about: kind0Result.about,
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      return {
        method: "kind:0",
        verified: false,
        error:
          error instanceof Error ? error.message : "kind:0 resolution failed",
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * Phase 1 Week 4: Multi-method version of PKARR resolution
   */
  private async tryPkarrResolutionMultiMethod(
    pubkey: string,
    identifier: string
  ): Promise<MethodVerificationResult | null> {
    const startTime = Date.now();
    try {
      // Dynamically import PubkyDHTClient to avoid bundling server-side code
      const { PubkyDHTClient } = await import(
        "../../lib/pubky-enhanced-client"
      );

      const dhtClient = new PubkyDHTClient(
        ["https://pkarr.relay.pubky.tech", "https://pkarr.relay.synonym.to"],
        3600000,
        this.config.pkarrTimeout || 3000,
        false
      );

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.pkarrTimeout || 3000);
      });

      const pkarrRecord = await Promise.race([
        dhtClient.resolveRecord(pubkey),
        timeoutPromise,
      ]);

      if (!pkarrRecord) {
        return {
          method: "pkarr",
          verified: false,
          error: "PKARR resolution timeout",
          response_time_ms: Date.now() - startTime,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }

      let nip05: string | undefined;
      let resolvedPubkey: string | undefined;

      for (const record of pkarrRecord.records) {
        if (record.type === "TXT") {
          try {
            const parsed = JSON.parse(record.value);
            if (parsed.nip05) nip05 = parsed.nip05;
            if (parsed.pubkey) resolvedPubkey = parsed.pubkey;
          } catch {
            if (record.value.includes("@")) {
              nip05 = record.value;
            }
          }
        }
      }

      if (nip05 && identifier) {
        const identifierMatch =
          nip05.toLowerCase() === identifier.toLowerCase();
        if (!identifierMatch) {
          return {
            method: "pkarr",
            verified: false,
            error: "NIP-05 mismatch",
            response_time_ms: Date.now() - startTime,
            timestamp: Math.floor(Date.now() / 1000),
          };
        }
      }

      if (resolvedPubkey && resolvedPubkey !== pubkey) {
        return {
          method: "pkarr",
          verified: false,
          error: "Pubkey mismatch",
          response_time_ms: Date.now() - startTime,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }

      return {
        method: "pkarr",
        verified: true,
        pubkey,
        nip05,
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      return {
        method: "pkarr",
        verified: false,
        error:
          error instanceof Error ? error.message : "PKARR resolution failed",
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * Phase 1 Week 4: Multi-method version of DNS resolution
   */
  private async tryDnsResolutionMultiMethod(
    identifier: string
  ): Promise<MethodVerificationResult | null> {
    const startTime = Date.now();
    try {
      const dnsResult = await this.tryDnsResolution(identifier);

      return {
        method: "dns",
        verified: dnsResult.verified,
        pubkey: dnsResult.pubkey,
        nip05: identifier,
        error: dnsResult.error,
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      return {
        method: "dns",
        verified: false,
        error: error instanceof Error ? error.message : "DNS resolution failed",
        response_time_ms: Date.now() - startTime,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * Phase 1 Week 4: Calculate trust score based on method agreement
   * Returns trust score (0-100), trust level, and method agreement details
   */
  private calculateTrustScore(
    methodResults: MethodVerificationResult[],
    identifier: string
  ): {
    trustScore: number;
    trustLevel: "high" | "medium" | "low" | "none";
    methodAgreement: {
      kind0?: boolean;
      pkarr?: boolean;
      dns?: boolean;
      agreementCount?: number;
    };
    primaryResult?: MethodVerificationResult;
  } {
    if (methodResults.length === 0) {
      return {
        trustScore: 0,
        trustLevel: "none",
        methodAgreement: { agreementCount: 0 },
      };
    }

    // Count verified methods
    const verifiedMethods = methodResults.filter((r) => r.verified);
    const agreementCount = verifiedMethods.length;

    // Check if all verified methods agree on NIP-05
    let allAgree = true;
    if (verifiedMethods.length > 1) {
      const firstNip05 = verifiedMethods[0].nip05?.toLowerCase();
      allAgree = verifiedMethods.every(
        (r) => r.nip05?.toLowerCase() === firstNip05
      );
    }

    // Calculate trust score
    let trustScore = 0;
    let trustLevel: "high" | "medium" | "low" | "none" = "none";

    if (agreementCount === 3 && allAgree) {
      // All three methods agree - highest trust
      trustScore = 100;
      trustLevel = "high";
    } else if (agreementCount === 2 && allAgree) {
      // Two methods agree - medium trust
      trustScore = 75;
      trustLevel = "medium";
    } else if (agreementCount === 1) {
      // Only one method succeeded - low trust
      trustScore = 50;
      trustLevel = "low";
    } else if (agreementCount > 0 && !allAgree) {
      // Methods disagree - low trust
      trustScore = 25;
      trustLevel = "low";
    }

    // Build method agreement object
    const methodAgreement: {
      kind0?: boolean;
      pkarr?: boolean;
      dns?: boolean;
      iroh?: boolean;
      agreementCount?: number;
    } = { agreementCount };

    for (const result of methodResults) {
      if (result.method === "kind:0") methodAgreement.kind0 = result.verified;
      if (result.method === "pkarr") methodAgreement.pkarr = result.verified;
      if (result.method === "dns") methodAgreement.dns = result.verified;
      // Phase 2B-2 Week 2: Add Iroh to method agreement tracking
      if (result.method === "iroh") methodAgreement.iroh = result.verified;
    }

    // Select primary result (prefer higher trust methods)
    let primaryResult = verifiedMethods[0];
    if (verifiedMethods.length > 1) {
      // Prefer kind:0 > pkarr > dns
      primaryResult =
        verifiedMethods.find((r) => r.method === "kind:0") ||
        verifiedMethods.find((r) => r.method === "pkarr") ||
        verifiedMethods[0];
    }

    return {
      trustScore,
      trustLevel,
      methodAgreement,
      primaryResult,
    };
  }

  /**
   * Phase 2B-2 Week 2: Multi-method version of Iroh discovery
   * Returns MethodVerificationResult for parallel verification
   */
  private async tryIrohDiscoveryMultiMethod(
    pubkey: string,
    identifier: string
  ): Promise<MethodVerificationResult | null> {
    const startTime = Date.now();
    try {
      // Dynamically import IrohVerificationService to avoid bundling when disabled
      const { irohVerificationService } = await import(
        "../services/irohVerificationService"
      );

      // Check if Iroh is enabled
      if (!irohVerificationService.isEnabled()) {
        return null;
      }

      // First, try to get node ID from kind:0 metadata
      const ceps = new CentralEventPublishingService();
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.kind0Timeout || 3000);
      });

      const kind0Result = await Promise.race([
        ceps.resolveIdentityFromKind0(pubkey),
        timeoutPromise,
      ]);

      let nodeId: string | null = null;
      if (kind0Result && kind0Result.success) {
        // Extract node ID from metadata
        nodeId = irohVerificationService.extractNodeIdFromMetadata(kind0Result);
      }

      // If no node ID found, cannot perform Iroh discovery
      if (!nodeId) {
        return {
          method: "iroh",
          verified: false,
          pubkey,
          nip05: identifier,
          error: "No Iroh node ID found in kind:0 metadata",
          response_time_ms: Date.now() - startTime,
          metadata: {
            iroh_enabled: true,
            node_id_found: false,
          },
        };
      }

      // Perform Iroh node discovery
      const irohTimeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), this.config.irohTimeout || 10000);
      });

      const discoveryResult = await Promise.race([
        irohVerificationService.verifyNode({ node_id: nodeId }),
        irohTimeoutPromise,
      ]);

      if (!discoveryResult) {
        return {
          method: "iroh",
          verified: false,
          pubkey,
          nip05: identifier,
          error: "Iroh discovery timeout",
          response_time_ms: Date.now() - startTime,
          metadata: {
            iroh_enabled: true,
            node_id: nodeId,
            timeout: true,
          },
        };
      }

      // Check if node is reachable
      const verified = discoveryResult.success && discoveryResult.is_reachable;

      return {
        method: "iroh",
        verified,
        pubkey,
        nip05: identifier,
        error: verified
          ? undefined
          : discoveryResult.error || "Node unreachable",
        response_time_ms: Date.now() - startTime,
        metadata: {
          iroh_enabled: true,
          node_id: nodeId,
          is_reachable: discoveryResult.is_reachable,
          relay_url: discoveryResult.relay_url,
          direct_addresses: discoveryResult.direct_addresses,
          cached: discoveryResult.cached,
        },
      };
    } catch (error) {
      return {
        method: "iroh",
        verified: false,
        pubkey,
        nip05: identifier,
        error: error instanceof Error ? error.message : "Iroh discovery failed",
        response_time_ms: Date.now() - startTime,
        metadata: {
          iroh_enabled: true,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  /**
   * Phase 1 Week 4: Check if trust level meets minimum requirement
   */
  private meetsMinimumTrustLevel(
    trustLevel: "high" | "medium" | "low" | "none"
  ): boolean {
    const minimumRequired = this.config.requireMinimumTrustLevel || "none";

    const trustLevelOrder = { none: 0, low: 1, medium: 2, high: 3 };
    const currentLevel = trustLevelOrder[trustLevel];
    const minimumLevel = trustLevelOrder[minimumRequired];

    return currentLevel >= minimumLevel;
  }

  /**
   * Get cached verification result
   */
  private getCachedVerification(
    identifier: string
  ): HybridVerificationResult | null {
    const cached = this.verificationCache.get(identifier);
    if (
      cached &&
      cached.verification_timestamp * 1000 + this.config.cache_duration_ms >
        Date.now()
    ) {
      return cached;
    }
    this.verificationCache.delete(identifier);
    return null;
  }

  /**
   * Cache verification result
   */
  private cacheVerification(
    identifier: string,
    result: HybridVerificationResult
  ): void {
    this.verificationCache.set(identifier, result);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.verificationCache.clear();
  }
}
