/**
 * NIP-05 Verification System
 * Implements proper NIP-05 verification for Nostr identifiers
 * @compliance Master Context - Privacy-first, browser-compatible, Bitcoin-only
 */

import { nip05 } from "nostr-tools";

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
    this.config = {
      default_timeout_ms: 5000,
      max_retries: 3,
      retry_delay_ms: 1000,
      cache_duration_ms: 300000, // 5 minutes
      allowed_domains: [
        'satnam.pub',
        'citadel.academy',
        'nostr.com',
        'damus.io',
        'snort.social',
        'iris.to',
        'primal.net',
        'relayable.org',
        'nostrplebs.com',
        'nostr.wine',
        'nostr.land',
        'nostr.band',
        'nostr.directory',
        'nostr.zone',
        'nostr.network',
        'nostr.world',
        'nostr.space',
        'nostr.tech',
        'nostr.dev',
        'nostr.org'
      ],
      blocked_domains: [
        'malicious.example.com',
        'phishing.example.com'
      ],
      ...config
    };
  }

  /**
   * Verify a NIP-05 identifier
   */
  async verifyNIP05(request: NIP05VerificationRequest): Promise<NIP05VerificationResult> {
    const startTime = Date.now();
    
    try {
      // Validate identifier format
      const validation = this.validateIdentifier(request.identifier);
      if (!validation.valid) {
        return {
          verified: false,
          error: validation.error,
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime
        };
      }

      // Check cache first
      const cached = this.getCachedVerification(request.identifier);
      if (cached) {
        return {
          ...cached,
          response_time_ms: Date.now() - startTime
        };
      }

      // Check domain security
      const domainCheck = this.checkDomainSecurity(validation.domain);
      if (!domainCheck.allowed) {
        return {
          verified: false,
          error: `Domain ${validation.domain} is not allowed`,
          verification_timestamp: Math.floor(Date.now() / 1000),
          response_time_ms: Date.now() - startTime
        };
      }

      // Perform NIP-05 verification
      const result = await this.performNIP05Verification(request, validation);
      
      // Cache the result
      this.cacheVerification(request.identifier, result);
      
      return {
        ...result,
        response_time_ms: Date.now() - startTime
      };

    } catch (error) {
      console.error('NIP-05 verification error:', error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown verification error',
        verification_timestamp: Math.floor(Date.now() / 1000),
        response_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Validate NIP-05 identifier format
   */
  private validateIdentifier(identifier: string): { valid: boolean; error?: string; domain?: string; username?: string } {
    // Check basic format: username@domain
    const nip05Regex = /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
    const match = identifier.match(nip05Regex);
    
    if (!match) {
      return {
        valid: false,
        error: 'Invalid NIP-05 format. Must be username@domain'
      };
    }

    const [, username, domain] = match;

    // Validate username
    if (username.length < 1 || username.length > 64) {
      return {
        valid: false,
        error: 'Username must be between 1 and 64 characters'
      };
    }

    // Validate domain
    if (domain.length < 4 || domain.length > 253) {
      return {
        valid: false,
        error: 'Domain must be between 4 and 253 characters'
      };
    }

    // Check for valid TLD
    const tldRegex = /\.[a-zA-Z]{2,}$/;
    if (!tldRegex.test(domain)) {
      return {
        valid: false,
        error: 'Domain must have a valid top-level domain'
      };
    }

    return {
      valid: true,
      domain,
      username
    };
  }

  /**
   * Check domain security (whitelist/blacklist)
   */
  private checkDomainSecurity(domain: string): { allowed: boolean; reason?: string } {
    // Check blacklist first
    if (this.config.blocked_domains?.includes(domain)) {
      return {
        allowed: false,
        reason: 'Domain is blacklisted'
      };
    }

    // Check whitelist if configured
    if (this.config.allowed_domains && this.config.allowed_domains.length > 0) {
      const isAllowed = this.config.allowed_domains.some(allowedDomain => {
        // Exact match
        if (domain === allowedDomain) return true;
        
        // Wildcard subdomain match (e.g., *.satnam.pub)
        if (allowedDomain.startsWith('*.')) {
          const baseDomain = allowedDomain.slice(2);
          return domain === baseDomain || domain.endsWith('.' + baseDomain);
        }
        
        return false;
      });

      if (!isAllowed) {
        return {
          allowed: false,
          reason: 'Domain not in allowed list'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Perform actual NIP-05 verification using nostr-tools
   */
  private async performNIP05Verification(
    request: NIP05VerificationRequest,
    validation: { domain: string; username: string }
  ): Promise<NIP05VerificationResult> {
    const timeout = request.timeout_ms || this.config.default_timeout_ms;
    
    // Use nostr-tools nip05.verify with retry logic
    for (let attempt = 1; attempt <= this.config.max_retries; attempt++) {
      try {
        const result = await Promise.race([
          nip05.verify(request.identifier),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Verification timeout')), timeout)
          )
        ]);

        // Verify against expected pubkey if provided
        if (request.expected_pubkey && result !== request.expected_pubkey) {
          return {
            verified: false,
            error: `NIP-05 verification failed: expected ${request.expected_pubkey}, got ${result}`,
            verification_timestamp: Math.floor(Date.now() / 1000)
          };
        }

        return {
          verified: true,
          pubkey: result,
          verification_timestamp: Math.floor(Date.now() / 1000)
        };

      } catch (error) {
        console.warn(`NIP-05 verification attempt ${attempt} failed:`, error);
        
        if (attempt === this.config.max_retries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay_ms));
      }
    }

    throw new Error('All verification attempts failed');
  }

  /**
   * Get cached verification result
   */
  private getCachedVerification(identifier: string): NIP05VerificationResult | null {
    const cached = this.verificationCache.get(identifier);
    if (!cached) return null;

    const now = Date.now();
    const cacheAge = now - (cached.verification_timestamp * 1000);
    
    if (cacheAge > this.config.cache_duration_ms) {
      this.verificationCache.delete(identifier);
      return null;
    }

    return cached;
  }

  /**
   * Cache verification result
   */
  private cacheVerification(identifier: string, result: NIP05VerificationResult): void {
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
      const cacheAge = now - (result.verification_timestamp * 1000);
      if (cacheAge > maxAge) {
        this.verificationCache.delete(identifier);
      }
    }
  }

  /**
   * Batch verify multiple NIP-05 identifiers
   */
  async batchVerifyNIP05(identifiers: string[]): Promise<Map<string, NIP05VerificationResult>> {
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
        if (chunkResult.status === 'fulfilled') {
          results.set(chunkResult.value.identifier, chunkResult.value.result);
        } else {
          console.error('Batch verification failed for identifier:', chunkResult.reason);
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
        timeout_ms: 10000 // Longer timeout for mentor verification
      });

      if (!result.verified) {
        return {
          verified: false,
          error: result.error || 'NIP-05 verification failed'
        };
      }

      // Additional mentor-specific verification
      const verificationData = {
        mentor_pubkey: mentorPubkey,
        nip05_identifier: nip05Identifier,
        verification_timestamp: result.verification_timestamp,
        response_time_ms: result.response_time_ms,
        dns_records: result.dns_records
      };

      return {
        verified: true,
        verification_data: verificationData
      };

    } catch (error) {
      console.error('Mentor NIP-05 verification error:', error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Get NIP-05 verification status for a pubkey
   */
  async getNIP05Status(pubkey: string): Promise<{ has_nip05: boolean; identifier?: string; verified?: boolean }> {
    try {
      // This would require querying Nostr relays for NIP-05 events
      // For now, return basic status
      return {
        has_nip05: false // Would be determined by querying relays
      };
    } catch (error) {
      console.error('Error getting NIP-05 status:', error);
      return {
        has_nip05: false
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
      maxAge: this.config.cache_duration_ms
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
  async verify(identifier: string, expectedPubkey?: string): Promise<NIP05VerificationResult> {
    return nip05VerificationService.verifyNIP05({ identifier, expected_pubkey: expectedPubkey });
  },

  /**
   * Verify mentor NIP-05
   */
  async verifyMentor(mentorPubkey: string, nip05Identifier: string) {
    return nip05VerificationService.verifyMentorNIP05(mentorPubkey, nip05Identifier);
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
  }
}; 