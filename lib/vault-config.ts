/**
 * @fileoverview Supabase Vault Configuration Manager
 * @description Securely manages application secrets using Supabase Vault
 * This replaces hardcoded environment variables with encrypted vault storage
 */

import { createClient } from "@supabase/supabase-js";

interface VaultSecret {
  name: string;
  description: string;
  required: boolean;
  fallbackEnvVar?: string;
}

/**
 * Configuration secrets stored in Supabase Vault
 */
const VAULT_SECRETS: Record<string, VaultSecret> = {
  // Core application secrets
  jwt_secret: {
    name: "jwt_secret",
    description: "JWT signing secret for authentication tokens",
    required: true,
    fallbackEnvVar: "JWT_SECRET",
  },
  privacy_master_key: {
    name: "privacy_master_key",
    description: "Master encryption key for privacy features",
    required: true,
    fallbackEnvVar: "PRIVACY_MASTER_KEY",
  },
  csrf_secret: {
    name: "csrf_secret",
    description: "CSRF protection secret",
    required: true,
    fallbackEnvVar: "CSRF_SECRET",
  },
  master_encryption_key: {
    name: "master_encryption_key",
    description: "Master encryption key for sensitive data",
    required: true,
    fallbackEnvVar: "MASTER_ENCRYPTION_KEY",
  },

  // Nostr/OTP secrets
  rebuilding_camelot_nsec: {
    name: "rebuilding_camelot_nsec",
    description:
      "Rebuilding Camelot Nostr private key for OTP DM authentication",
    required: false,
  },
  rebuilding_camelot_npub: {
    name: "rebuilding_camelot_npub",
    description: "Rebuilding Camelot Nostr public key for verification",
    required: false,
  },
  rebuilding_camelot_nip05: {
    name: "rebuilding_camelot_nip05",
    description: "Rebuilding Camelot NIP-05 address for user verification",
    required: false,
  },
};

/**
 * Vault Configuration Manager
 */
export class VaultConfigManager {
  private supabase: any;
  private secretsCache: Map<string, string> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize Supabase client with service role for vault access
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn(
        "⚠️  Supabase credentials not found - Vault features disabled"
      );
      console.warn(
        "   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable Vault"
      );
      return;
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Get a secret from Vault with fallback to environment variables
   */
  async getSecret(secretName: string): Promise<string | null> {
    const secretConfig = VAULT_SECRETS[secretName];
    if (!secretConfig) {
      throw new Error(`Unknown secret: ${secretName}`);
    }

    // Check cache first
    const cached = this.getCachedSecret(secretName);
    if (cached) {
      return cached;
    }

    // Try Vault first
    if (this.supabase) {
      try {
        const vaultValue = await this.getFromVault(secretName);
        if (vaultValue) {
          this.setCachedSecret(secretName, vaultValue);
          return vaultValue;
        }
      } catch (error) {
        console.warn(`⚠️  Failed to get ${secretName} from Vault:`, error);
      }
    }

    // Fallback to environment variable
    if (secretConfig.fallbackEnvVar) {
      const envValue = process.env[secretConfig.fallbackEnvVar];
      if (envValue) {
        console.log(`📝 Using environment variable for ${secretName}`);
        return envValue;
      }
    }

    // Handle required secrets
    if (secretConfig.required) {
      throw new Error(
        `Required secret '${secretName}' not found in Vault or environment variables`
      );
    }

    return null;
  }

  /**
   * Store a secret in Vault
   */
  async storeSecret(secretName: string, value: string): Promise<boolean> {
    const secretConfig = VAULT_SECRETS[secretName];
    if (!secretConfig) {
      throw new Error(`Unknown secret: ${secretName}`);
    }

    if (!this.supabase) {
      throw new Error("Vault not available - Supabase not configured");
    }

    try {
      const { error } = await this.supabase.rpc("vault_create_secret", {
        secret_value: value,
        secret_name: secretName,
        secret_description: secretConfig.description,
      });

      if (error) {
        console.error(`❌ Failed to store secret ${secretName}:`, error);
        return false;
      }

      // Clear cache to force refresh
      this.secretsCache.delete(secretName);
      this.cacheExpiry.delete(secretName);

      console.log(`✅ Secret ${secretName} stored in Vault`);
      return true;
    } catch (error) {
      console.error(`❌ Error storing secret ${secretName}:`, error);
      return false;
    }
  }

  /**
   * Initialize all required secrets in Vault
   */
  async initializeVaultSecrets(): Promise<boolean> {
    if (!this.supabase) {
      console.log("📝 Vault not available - using environment variables");
      return this.validateEnvironmentSecrets();
    }

    console.log("🔐 Initializing Vault secrets...");

    let allSuccess = true;
    const requiredSecrets = Object.entries(VAULT_SECRETS).filter(
      ([_, config]) => config.required
    );

    for (const [secretName, config] of requiredSecrets) {
      try {
        const existing = await this.getFromVault(secretName);
        if (existing) {
          console.log(`✅ Secret ${secretName} already exists in Vault`);
          continue;
        }

        // Try to migrate from environment variable
        if (config.fallbackEnvVar) {
          const envValue = process.env[config.fallbackEnvVar];
          if (
            envValue &&
            !envValue.includes("dev-") &&
            !envValue.includes("your_")
          ) {
            const success = await this.storeSecret(secretName, envValue);
            if (success) {
              console.log(
                `📦 Migrated ${secretName} from environment to Vault`
              );
              continue;
            }
          }
        }

        console.warn(
          `⚠️  Secret ${secretName} not found in Vault or environment`
        );
        allSuccess = false;
      } catch (error) {
        console.error(`❌ Error initializing secret ${secretName}:`, error);
        allSuccess = false;
      }
    }

    return allSuccess;
  }

  /**
   * Get secret directly from Vault
   */
  private async getFromVault(secretName: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from("vault.decrypted_secrets")
        .select("decrypted_secret")
        .eq("name", secretName)
        .single();

      if (error) {
        if (error.code !== "PGRST116") {
          // Not found error
          console.warn(`Vault query error for ${secretName}:`, error);
        }
        return null;
      }

      return data?.decrypted_secret || null;
    } catch (error) {
      console.warn(`Vault access error for ${secretName}:`, error);
      return null;
    }
  }

  /**
   * Cache management
   */
  private getCachedSecret(secretName: string): string | null {
    const expiry = this.cacheExpiry.get(secretName);
    if (!expiry || Date.now() > expiry) {
      this.secretsCache.delete(secretName);
      this.cacheExpiry.delete(secretName);
      return null;
    }
    return this.secretsCache.get(secretName) || null;
  }

  private setCachedSecret(secretName: string, value: string): void {
    this.secretsCache.set(secretName, value);
    this.cacheExpiry.set(secretName, Date.now() + this.CACHE_TTL);
  }

  /**
   * Validate environment variables as fallback
   */
  private validateEnvironmentSecrets(): boolean {
    let allValid = true;
    const requiredSecrets = Object.entries(VAULT_SECRETS).filter(
      ([_, config]) => config.required
    );

    for (const [secretName, config] of requiredSecrets) {
      if (config.fallbackEnvVar) {
        const envValue = process.env[config.fallbackEnvVar];
        if (!envValue) {
          console.error(
            `❌ Required environment variable missing: ${config.fallbackEnvVar}`
          );
          allValid = false;
        } else if (envValue.includes("dev-") || envValue.includes("your_")) {
          console.warn(
            `⚠️  Environment variable ${config.fallbackEnvVar} appears to be a placeholder`
          );
        }
      }
    }

    return allValid;
  }

  /**
   * Health check for Vault connectivity
   */
  async healthCheck(): Promise<boolean> {
    if (!this.supabase) {
      return false;
    }

    try {
      // Try to access vault schema
      const { error } = await this.supabase
        .from("vault.decrypted_secrets")
        .select("name")
        .limit(1);

      return !error;
    } catch (error) {
      console.warn("Vault health check failed:", error);
      return false;
    }
  }
}

// Global instance
export const vaultConfig = new VaultConfigManager();

/**
 * Convenience functions for common secrets
 */
export async function getJwtSecret(): Promise<string> {
  const secret = await vaultConfig.getSecret("jwt_secret");
  if (!secret) {
    throw new Error("JWT secret not configured");
  }
  return secret;
}

export async function getPrivacyMasterKey(): Promise<string> {
  const secret = await vaultConfig.getSecret("privacy_master_key");
  if (!secret) {
    throw new Error("Privacy master key not configured");
  }
  return secret;
}

export async function getCsrfSecret(): Promise<string> {
  const secret = await vaultConfig.getSecret("csrf_secret");
  if (!secret) {
    throw new Error("CSRF secret not configured");
  }
  return secret;
}

export async function getMasterEncryptionKey(): Promise<string> {
  const secret = await vaultConfig.getSecret("master_encryption_key");
  if (!secret) {
    throw new Error("Master encryption key not configured");
  }
  return secret;
}
