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
  rotationRequired?: boolean;
  guardianApprovalRequired?: boolean;
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
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  privacy_master_key: {
    name: "privacy_master_key",
    description: "Master encryption key for privacy features",
    required: true,
    fallbackEnvVar: "PRIVACY_MASTER_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  csrf_secret: {
    name: "csrf_secret",
    description: "CSRF protection secret",
    required: true,
    fallbackEnvVar: "CSRF_SECRET",
    rotationRequired: true,
  },
  master_encryption_key: {
    name: "master_encryption_key",
    description: "Master encryption key for sensitive data",
    required: true,
    fallbackEnvVar: "MASTER_ENCRYPTION_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },

  // Nostr/OTP secrets
  rebuilding_camelot_nsec: {
    name: "rebuilding_camelot_nsec",
    description:
      "Rebuilding Camelot Nostr private key for OTP DM authentication",
    required: false,
    rotationRequired: true,
    guardianApprovalRequired: true,
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

  // Lightning Infrastructure Secrets
  phoenixd_host: {
    name: "phoenixd_host",
    description: "PhoenixD Lightning node host URL",
    required: true,
    fallbackEnvVar: "VITE_PHOENIXD_HOST",
    rotationRequired: false,
  },
  phoenixd_api_token: {
    name: "phoenixd_api_token",
    description: "PhoenixD Lightning node API authentication token",
    required: true,
    fallbackEnvVar: "VITE_PHOENIXD_API_TOKEN",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  phoenixd_username: {
    name: "phoenixd_username",
    description: "PhoenixD Lightning node username",
    required: true,
    fallbackEnvVar: "VITE_PHOENIXD_USERNAME",
    rotationRequired: false,
  },
  phoenixd_min_channel_size: {
    name: "phoenixd_min_channel_size",
    description: "PhoenixD minimum channel size in satoshis",
    required: true,
    fallbackEnvVar: "VITE_PHOENIXD_MIN_CHANNEL_SIZE",
    rotationRequired: false,
  },

  // Voltage Lightning Infrastructure
  voltage_api_key: {
    name: "voltage_api_key",
    description: "Voltage Lightning API key for enterprise infrastructure",
    required: false,
    fallbackEnvVar: "VOLTAGE_API_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  voltage_api_endpoint: {
    name: "voltage_api_endpoint",
    description: "Voltage Lightning API endpoint URL",
    required: false,
    fallbackEnvVar: "VOLTAGE_API_ENDPOINT",
    rotationRequired: false,
  },
  voltage_node_id: {
    name: "voltage_node_id",
    description: "Voltage Lightning node identifier",
    required: false,
    fallbackEnvVar: "VOLTAGE_NODE_ID",
    rotationRequired: false,
  },

  // LNbits Infrastructure
  lnbits_admin_key: {
    name: "lnbits_admin_key",
    description: "LNbits admin API key for wallet management",
    required: false,
    fallbackEnvVar: "LNBITS_ADMIN_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  lnbits_url: {
    name: "lnbits_url",
    description: "LNbits server URL",
    required: false,
    fallbackEnvVar: "LNBITS_URL",
    rotationRequired: false,
  },

  // Fedimint Guardian Secrets
  fedimint_guardian_private_key: {
    name: "fedimint_guardian_private_key",
    description: "Fedimint guardian private key for federation operations",
    required: false,
    fallbackEnvVar: "FEDIMINT_GUARDIAN_PRIVATE_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  fedimint_federation_config: {
    name: "fedimint_federation_config",
    description: "Fedimint federation configuration data",
    required: false,
    fallbackEnvVar: "FEDIMINT_FEDERATION_CONFIG",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  fedimint_gateway_url: {
    name: "fedimint_gateway_url",
    description: "Fedimint gateway server URL",
    required: false,
    fallbackEnvVar: "FEDIMINT_GATEWAY_URL",
    rotationRequired: false,
  },

  // Lightning Node Secrets (LND/CLN)
  lnd_macaroon: {
    name: "lnd_macaroon",
    description: "LND Lightning node macaroon for authentication",
    required: false,
    fallbackEnvVar: "LND_MACAROON",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  lnd_socket: {
    name: "lnd_socket",
    description: "LND Lightning node socket URL",
    required: false,
    fallbackEnvVar: "LND_SOCKET",
    rotationRequired: false,
  },
  lnd_cert_path: {
    name: "lnd_cert_path",
    description: "LND Lightning node certificate path",
    required: false,
    fallbackEnvVar: "LND_CERT_PATH",
    rotationRequired: false,
  },

  // BTCPay Server Integration
  btcpay_server_url: {
    name: "btcpay_server_url",
    description: "BTCPay Server URL for payment processing",
    required: false,
    fallbackEnvVar: "BTCPAY_SERVER_URL",
    rotationRequired: false,
  },
  btcpay_store_id: {
    name: "btcpay_store_id",
    description: "BTCPay Server store identifier",
    required: false,
    fallbackEnvVar: "BTCPAY_STORE_ID",
    rotationRequired: false,
  },
  btcpay_api_key: {
    name: "btcpay_api_key",
    description: "BTCPay Server API key for payment processing",
    required: false,
    fallbackEnvVar: "BTCPAY_API_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },

  // Nostr Relay Infrastructure
  nostr_relay_url: {
    name: "nostr_relay_url",
    description: "Primary Nostr relay URL for event publishing",
    required: false,
    fallbackEnvVar: "NOSTR_RELAY_URL",
    rotationRequired: false,
  },
  nostr_relay_admin_key: {
    name: "nostr_relay_admin_key",
    description: "Nostr relay admin key for management",
    required: false,
    fallbackEnvVar: "NOSTR_RELAY_ADMIN_KEY",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },

  // Privacy and Security
  privacy_salt: {
    name: "privacy_salt",
    description: "Salt for privacy-preserving operations",
    required: true,
    fallbackEnvVar: "PRIVACY_SALT",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },
  encryption_iv: {
    name: "encryption_iv",
    description: "Initialization vector for encryption operations",
    required: true,
    fallbackEnvVar: "ENCRYPTION_IV",
    rotationRequired: true,
    guardianApprovalRequired: true,
  },

  // Application Configuration
  app_base_url: {
    name: "app_base_url",
    description:
      "Base URL for the application (production: https://satnam.pub)",
    required: true,
    fallbackEnvVar: "BASE_URL",
    rotationRequired: false,
  },
  api_base_url: {
    name: "api_base_url",
    description: "Base URL for API endpoints",
    required: true,
    fallbackEnvVar: "API_BASE_URL",
    rotationRequired: false,
  },

  // Development and Testing
  test_private_key: {
    name: "test_private_key",
    description: "Test private key for development",
    required: false,
    fallbackEnvVar: "TEST_PRIVATE_KEY",
    rotationRequired: false,
  },
  test_public_key: {
    name: "test_public_key",
    description: "Test public key for development",
    required: false,
    fallbackEnvVar: "TEST_PUBLIC_KEY",
    rotationRequired: false,
  },
};

// Global singleton instance
let globalVaultConfigManager: VaultConfigManager | null = null;

/**
 * Vault Configuration Manager
 * Manages application secrets using Supabase Vault with browser-compatible implementation
 */
export class VaultConfigManager {
  private supabase: any;
  private secretsCache: Map<string, string> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Browser-only implementation - no server-side code
    if (typeof window === "undefined") {
      throw new Error(
        "VaultConfigManager is browser-only and cannot run in server environment"
      );
    }

    // Singleton pattern - prevent multiple instances
    if (globalVaultConfigManager) {
      console.log("🔄 Returning existing VaultConfigManager instance");
      return globalVaultConfigManager;
    }

    console.log(
      "🔐 Creating VaultConfigManager instance (lazy initialization)"
    );
    // Don't initialize immediately - wait for first use
    // this.initializeBrowserVault();

    // Store the instance globally
    globalVaultConfigManager = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): VaultConfigManager {
    if (!globalVaultConfigManager) {
      globalVaultConfigManager = new VaultConfigManager();
    }
    return globalVaultConfigManager;
  }

  /**
   * Initialize Vault for browser environment with local credential storage
   */
  private async initializeBrowserVault(): Promise<void> {
    if (this.supabase) {
      return; // Already initialized
    }

    // Try to import and use the main Supabase client to prevent multiple instances
    try {
      // Dynamic import to avoid circular dependencies
      const { supabase } = await import("../src/lib/supabase");
      this.supabase = supabase;
      console.log("✅ Using main Supabase client for vault operations");
    } catch (error) {
      // Fallback to creating a new client if import fails
      console.log("⚠️ Main client import failed, using fallback");
      this.createFallbackClient();
    }
  }

  /**
   * Create fallback Supabase client if main client is not available
   */
  private createFallbackClient(): void {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "CRITICAL: Bootstrap Supabase credentials missing for Vault access. " +
          "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log("✅ Fallback Supabase client created for vault operations");
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

    // Try Vault first (with lazy initialization)
    if (!this.supabase) {
      await this.initializeBrowserVault();
    }

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

    // Fallback to environment variable (server-side only)
    if (secretConfig.fallbackEnvVar && typeof process !== "undefined") {
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
   * Rotate a secret with guardian approval workflow
   */
  async rotateSecret(
    secretName: string,
    newValue: string,
    guardianApproval?: boolean
  ): Promise<boolean> {
    const secretConfig = VAULT_SECRETS[secretName];
    if (!secretConfig) {
      throw new Error(`Unknown secret: ${secretName}`);
    }

    // Check if guardian approval is required
    if (secretConfig.guardianApprovalRequired && !guardianApproval) {
      throw new Error(
        `Guardian approval required for rotating secret: ${secretName}`
      );
    }

    // Store the new secret value
    const success = await this.storeSecret(secretName, newValue);

    if (success) {
      console.log(`🔄 Secret ${secretName} rotated successfully`);

      // Log the rotation for audit purposes
      await this.logSecretRotation(secretName, guardianApproval || false);
    }

    return success;
  }

  /**
   * Get all secrets that require guardian approval for rotation
   */
  getSecretsRequiringGuardianApproval(): string[] {
    return Object.entries(VAULT_SECRETS)
      .filter(([_, config]) => config.guardianApprovalRequired)
      .map(([name, _]) => name);
  }

  /**
   * Get all secrets that require rotation
   */
  getSecretsRequiringRotation(): string[] {
    return Object.entries(VAULT_SECRETS)
      .filter(([_, config]) => config.rotationRequired)
      .map(([name, _]) => name);
  }

  /**
   * Initialize all required secrets in Vault
   */
  async initializeVaultSecrets(): Promise<boolean> {
    if (!this.supabase) {
      console.log("📝 Vault not available in browser environment");
      return false;
    }

    console.log("🔐 Initializing browser Vault secrets...");

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

        // In browser environment, secrets must be manually configured
        console.warn(
          `⚠️  Secret ${secretName} not found in Vault - must be configured manually`
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
    if (expiry && Date.now() < expiry) {
      return this.secretsCache.get(secretName) || null;
    }

    // Clear expired cache
    this.secretsCache.delete(secretName);
    this.cacheExpiry.delete(secretName);
    return null;
  }

  private setCachedSecret(secretName: string, value: string): void {
    this.secretsCache.set(secretName, value);
    this.cacheExpiry.set(secretName, Date.now() + this.CACHE_TTL);
  }

  /**
   * Validate environment secrets (fallback mode)
   */
  private validateEnvironmentSecrets(): boolean {
    console.log("🔍 Browser environment - no environment validation needed");
    return false;
  }

  /**
   * Log secret rotation for audit purposes
   */
  private async logSecretRotation(
    secretName: string,
    guardianApproved: boolean
  ): Promise<void> {
    try {
      await this.supabase.from("vault_audit_log").insert({
        secret_name: secretName,
        action: "rotation",
        guardian_approved: guardianApproved,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("Failed to log secret rotation:", error);
    }
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

  /**
   * Test credential retrieval and verification
   */
  async testCredentialRetrieval(
    secretName: string,
    expectedValue?: string
  ): Promise<boolean> {
    try {
      const retrievedValue = await this.getSecret(secretName);

      if (!retrievedValue) {
        console.error(`❌ Failed to retrieve secret: ${secretName}`);
        return false;
      }

      if (expectedValue && retrievedValue !== expectedValue) {
        console.error(`❌ Secret value mismatch for: ${secretName}`);
        return false;
      }

      console.log(
        `✅ Successfully retrieved and verified secret: ${secretName}`
      );
      return true;
    } catch (error) {
      console.error(
        `❌ Error testing credential retrieval for ${secretName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Test secret rotation workflow
   */
  async testSecretRotation(secretName: string): Promise<boolean> {
    try {
      const originalValue = await this.getSecret(secretName);
      if (!originalValue) {
        console.error(
          `❌ Cannot test rotation - secret not found: ${secretName}`
        );
        return false;
      }

      // Generate a test value
      const testValue = `test_rotated_${Date.now()}`;

      // Rotate the secret
      const rotationSuccess = await this.rotateSecret(
        secretName,
        testValue,
        true
      );
      if (!rotationSuccess) {
        console.error(`❌ Secret rotation failed: ${secretName}`);
        return false;
      }

      // Verify the new value
      const newValue = await this.getSecret(secretName);
      if (newValue !== testValue) {
        console.error(`❌ Secret rotation verification failed: ${secretName}`);
        return false;
      }

      // Restore original value
      const restoreSuccess = await this.rotateSecret(
        secretName,
        originalValue,
        true
      );
      if (!restoreSuccess) {
        console.error(
          `❌ Failed to restore original secret value: ${secretName}`
        );
        return false;
      }

      console.log(`✅ Secret rotation test successful: ${secretName}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Error testing secret rotation for ${secretName}:`,
        error
      );
      return false;
    }
  }
}

// Lazy global instance - only create when accessed
let globalVaultConfig: VaultConfigManager | null = null;
export const getVaultConfig = (): VaultConfigManager => {
  if (!globalVaultConfig) {
    globalVaultConfig = VaultConfigManager.getInstance();
  }
  return globalVaultConfig;
};

/**
 * Convenience functions for common secrets
 */
export async function getJwtSecret(): Promise<string> {
  const secret = await getVaultConfig().getSecret("jwt_secret");
  if (!secret) {
    throw new Error("JWT secret not configured");
  }
  return secret;
}

export async function getPrivacyMasterKey(): Promise<string> {
  const secret = await getVaultConfig().getSecret("privacy_master_key");
  if (!secret) {
    throw new Error("Privacy master key not configured");
  }
  return secret;
}

export async function getCsrfSecret(): Promise<string> {
  const secret = await getVaultConfig().getSecret("csrf_secret");
  if (!secret) {
    throw new Error("CSRF secret not configured");
  }
  return secret;
}

export async function getMasterEncryptionKey(): Promise<string> {
  const secret = await getVaultConfig().getSecret("master_encryption_key");
  if (!secret) {
    throw new Error("Master encryption key not configured");
  }
  return secret;
}
