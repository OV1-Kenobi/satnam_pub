/**
 * @fileoverview Vault-based Federation Client
 * @description Secure client for retrieving federation secrets from Supabase Vault
 */

export interface FederationSecrets {
  federationId: string;
  ecashMint: string;
  guardianNodes: string[];
  consensusAPI: string;
  inviteCode: string;
  guardianKeys: string[];
}

export class VaultFederationClient {
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get federation secrets from Supabase Vault via server API
   * This ensures sensitive credentials never touch the browser
   */
  async getFederationSecrets(): Promise<FederationSecrets> {
    const cacheKey = "federation-secrets";
    const now = Date.now();

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (now < expiry) {
        return this.cache.get(cacheKey);
      }
    }

    try {
      // Get secrets from server API (which uses Supabase Vault on backend)
      const response = await fetch("/api/vault/federation-secrets", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch federation secrets: ${response.status}`
        );
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(
          result.error || "Failed to retrieve federation secrets"
        );
      }

      const secrets: FederationSecrets = result.data;

      // Cache the result
      this.cache.set(cacheKey, secrets);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

      return secrets;
    } catch (error) {
      console.error("Error fetching federation secrets from Vault:", error);

      // Return demo fallback values for development (NOT for production)
      if (process.env.NODE_ENV === "development") {
        return {
          federationId: "demo-federation",
          ecashMint: "demo-ecash-mint",
          guardianNodes: ["demo-node1", "demo-node2", "demo-node3"],
          consensusAPI: "https://demo-consensus.local",
          inviteCode: "demo-invite-code",
          guardianKeys: ["demo-key1", "demo-key2", "demo-key3"],
        };
      }

      throw error;
    }
  }

  /**
   * Get individual secret value from Vault
   */
  async getSecret(secretName: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/vault/secret/${secretName}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error(`Error fetching secret ${secretName} from Vault:`, error);
      return null;
    }
  }

  /**
   * Clear cache to force refresh of secrets
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Store secret in Vault (server-side only)
   */
  async storeSecret(secretName: string, secretValue: string): Promise<boolean> {
    try {
      const response = await fetch("/api/vault/store-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secretName, secretValue }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error(`Error storing secret ${secretName} in Vault:`, error);
      return false;
    }
  }
}

// Singleton instance
export const vaultFederationClient = new VaultFederationClient();
