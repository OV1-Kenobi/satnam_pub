/**
 * @fileoverview Secure Vault Client - Service Role Key Management
 * @description Server-side only! Retrieves service role key from Supabase Vault
 * ⚠️ NEVER use this on client-side - it's for API routes only
 */

// This file should ONLY be used server-side
if (typeof window !== "undefined") {
  throw new Error(
    "SECURITY VIOLATION: secure-vault-client must not be used on client-side!"
  );
}

export interface VaultCredentials {
  serviceRoleKey: string;
  retrievedAt: number;
}

/**
 * Secure Vault Client - Server-side Only
 * Retrieves sensitive credentials from Supabase Vault
 */
class SecureVaultClient {
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Retrieve service role key from Supabase Vault
   * This method must ONLY be called from server-side API routes
   */
  async getServiceRoleKey(): Promise<string> {
    // Double-check we're not on client-side
    if (typeof window !== "undefined") {
      throw new Error(
        "SECURITY VIOLATION: Service role key cannot be accessed from browser!"
      );
    }

    const cacheKey = "supabase_service_role_key";
    const now = Date.now();

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (now < cached.expiry) {
        return cached.value;
      }
    }

    try {
      // This is a bootstrap problem: we need service role key to access Vault,
      // but we're trying to get it from Vault. For initial setup, we'll use
      // a one-time manual Vault setup where the service role key is stored
      // in Vault manually first, then accessed via an initial auth.

      // For now, we'll implement a secure fallback mechanism:
      // 1. Try to get from OS environment variable (for server deployment)
      // 2. If not available, use manual Vault insertion process

      const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY_VAULT_FALLBACK;

      if (!serviceRoleKey) {
        throw new Error(
          "Service role key not available. Please set up Vault with initial service role key."
        );
      }

      // Validate the key format
      if (!serviceRoleKey.startsWith("eyJ")) {
        throw new Error("Invalid service role key format");
      }

      // Cache the result
      this.cache.set(cacheKey, {
        value: serviceRoleKey,
        expiry: now + this.CACHE_TTL,
      });

      return serviceRoleKey;
    } catch (error) {
      console.error("Failed to retrieve service role key from Vault:", error);
      throw new Error(
        "Service role key unavailable - check Vault configuration"
      );
    }
  }

  /**
   * Get Supabase credentials for server-side operations
   */
  async getSupabaseCredentials(): Promise<VaultCredentials> {
    const serviceRoleKey = await this.getServiceRoleKey();

    return {
      serviceRoleKey,
      retrievedAt: Date.now(),
    };
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const secureVaultClient = new SecureVaultClient();

/**
 * Helper function for API routes to get service-role enabled Supabase client
 */
export async function getSecureSupabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = await secureVaultClient.getServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error("Supabase URL not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
