/**
 * Browser-Compatible Configuration Manager
 *
 * FOLLOWS SATNAM.PUB MASTER CONTEXT:
 * - Uses Supabase Vault ONLY (NO process.env)
 * - Browser-compatible serverless environment
 * - NO Node.js dependencies
 * - Privacy-first configuration management
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types for configuration management
export interface ConfigValue {
  key: string;
  value: string;
  encrypted: boolean;
  created_at: string;
  updated_at: string;
}

export interface VaultConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  vaultTable: string;
}

export interface AppConfig {
  // API Configuration
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };

  // Nostr Configuration
  nostr: {
    relays: string[];
    privateKey?: string;
    publicKey?: string;
  };

  // Lightning Configuration
  lightning: {
    nodeType: "voltage" | "phoenixd" | "breez" | "nwc" | "self-hosted";
    nodeUrl?: string;
    macaroon?: string;
    cert?: string;
  };

  // NIP-05 Configuration
  nip05: {
    allowedDomains: string[];
    verificationUrl: string;
  };

  // Privacy Configuration
  privacy: {
    encryptionEnabled: boolean;
    saltRotationInterval: number;
    dataRetentionDays: number;
  };

  // Family Configuration
  family: {
    maxMembers: number;
    defaultSpendingLimit: number;
    approvalThreshold: number;
  };
}

/**
 * Configuration Manager for Satnam.pub
 * Manages configuration using Supabase Vault for security
 */
export class ConfigManager {
  private supabase: SupabaseClient;
  private vaultTable: string;
  private cache: Map<string, ConfigValue> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(vaultConfig: VaultConfig) {
    this.supabase = createClient(
      vaultConfig.supabaseUrl,
      vaultConfig.supabaseAnonKey
    );
    this.vaultTable = vaultConfig.vaultTable || "vault_config";
  }

  /**
   * Get configuration value from vault
   */
  async get(key: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.getCached(key);
      if (cached !== null) {
        return cached;
      }

      // Fetch from vault
      const { data, error } = await this.supabase
        .from(this.vaultTable)
        .select("*")
        .eq("key", key)
        .single();

      if (error || !data) {
        console.warn(`Configuration key '${key}' not found in vault`);
        return null;
      }

      // Cache the result
      this.setCached(key, data);

      return data.encrypted ? await this.decrypt(data.value) : data.value;
    } catch (error) {
      console.error(`Error getting config key '${key}':`, error);
      return null;
    }
  }

  /**
   * Set configuration value in vault
   */
  async set(
    key: string,
    value: string,
    encrypted: boolean = false
  ): Promise<boolean> {
    try {
      const processedValue = encrypted ? await this.encrypt(value) : value;

      const configValue: Partial<ConfigValue> = {
        key,
        value: processedValue,
        encrypted,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.supabase
        .from(this.vaultTable)
        .upsert(configValue);

      if (error) {
        console.error(`Error setting config key '${key}':`, error);
        return false;
      }

      // Update cache
      this.setCached(key, configValue as ConfigValue);
      return true;
    } catch (error) {
      console.error(`Error setting config key '${key}':`, error);
      return false;
    }
  }

  /**
   * Delete configuration value from vault
   */
  async delete(key: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from(this.vaultTable)
        .delete()
        .eq("key", key);

      if (error) {
        console.error(`Error deleting config key '${key}':`, error);
        return false;
      }

      // Remove from cache
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return true;
    } catch (error) {
      console.error(`Error deleting config key '${key}':`, error);
      return false;
    }
  }

  /**
   * Get all configuration keys
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from(this.vaultTable)
        .select("key");

      if (error) {
        console.error("Error getting all config keys:", error);
        return [];
      }

      return data.map((item) => item.key);
    } catch (error) {
      console.error("Error getting all config keys:", error);
      return [];
    }
  }

  /**
   * Load complete application configuration
   */
  async loadAppConfig(): Promise<Partial<AppConfig>> {
    try {
      const config: Partial<AppConfig> = {};

      // Load API configuration
      config.api = {
        baseUrl: (await this.get("API_BASE_URL")) || "https://satnam.pub",
        timeout: parseInt((await this.get("API_TIMEOUT")) || "30000"),
        retries: parseInt((await this.get("API_RETRIES")) || "3"),
      };

      // Load Nostr configuration
      const nostrRelays = await this.get("NOSTR_RELAYS");
      const nostrPrivateKey = await this.get("NOSTR_PRIVATE_KEY");
      const nostrPublicKey = await this.get("NOSTR_PUBLIC_KEY");
      config.nostr = {
        relays: nostrRelays
          ? nostrRelays.split(",")
          : ["wss://relay.damus.io", "wss://nos.lol"],
        privateKey: nostrPrivateKey || undefined,
        publicKey: nostrPublicKey || undefined,
      };

      // Load Lightning configuration
      const lightningNodeType = await this.get("LIGHTNING_NODE_TYPE");
      const lightningNodeUrl = await this.get("LIGHTNING_NODE_URL");
      const lightningMacaroon = await this.get("LIGHTNING_MACAROON");
      const lightningCert = await this.get("LIGHTNING_CERT");

      config.lightning = {
        nodeType:
          (lightningNodeType as
            | "voltage"
            | "phoenixd"
            | "breez"
            | "nwc"
            | "self-hosted") || "voltage",
        nodeUrl: lightningNodeUrl || undefined,
        macaroon: lightningMacaroon || undefined,
        cert: lightningCert || undefined,
      };

      // Load NIP-05 configuration
      const nip05Domains = await this.get("NIP05_ALLOWED_DOMAINS");
      config.nip05 = {
        allowedDomains: nip05Domains
          ? nip05Domains.split(",")
          : ["satnam.pub", "citadel.academy"],
        verificationUrl:
          (await this.get("NIP05_VERIFICATION_URL")) ||
          "https://satnam.pub/.well-known/nostr.json",
      };

      // Load Privacy configuration
      config.privacy = {
        encryptionEnabled:
          (await this.get("PRIVACY_ENCRYPTION_ENABLED")) === "true",
        saltRotationInterval: parseInt(
          (await this.get("PRIVACY_SALT_ROTATION_INTERVAL")) || "86400000"
        ), // 24 hours
        dataRetentionDays: parseInt(
          (await this.get("PRIVACY_DATA_RETENTION_DAYS")) || "90"
        ),
      };

      // Load Family configuration
      config.family = {
        maxMembers: parseInt((await this.get("FAMILY_MAX_MEMBERS")) || "10"),
        defaultSpendingLimit: parseInt(
          (await this.get("FAMILY_DEFAULT_SPENDING_LIMIT")) || "100000"
        ), // 100k sats
        approvalThreshold: parseInt(
          (await this.get("FAMILY_APPROVAL_THRESHOLD")) || "1"
        ), // 1-of-2 minimum
      };

      return config;
    } catch (error) {
      console.error("Error loading app configuration:", error);
      return {};
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cached configuration value
   */
  private getCached(key: string): string | null {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }

    const cached = this.cache.get(key);
    return cached ? cached.value : null;
  }

  /**
   * Set cached configuration value
   */
  private setCached(key: string, value: ConfigValue): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Derive encryption key from master password using PBKDF2
   * Master Context compliant key derivation
   */
  private async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    // Derive AES-GCM key using PBKDF2
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000, // High iteration count for security
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, // Not extractable for security
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypt sensitive configuration value using Web Crypto API
   * Implements AES-GCM encryption with PBKDF2 key derivation for Master Context compliance
   */
  private async encrypt(value: string): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error(
        "Web Crypto API not available - cannot encrypt sensitive data"
      );
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(value);

      // Generate salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Derive key from master password (in production, this should come from secure storage)
      const masterPassword = "satnam-vault-master-key"; // TODO: Get from secure source
      const key = await this.deriveKey(masterPassword, salt);

      // Encrypt the data
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        data as BufferSource
      );

      // Combine salt, IV, and encrypted data for storage
      const combined = new Uint8Array(
        salt.length + iv.length + encrypted.byteLength
      );
      combined.set(salt);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Return base64 encoded result
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error("Encryption failed:", error);
      throw new Error("Failed to encrypt sensitive configuration value");
    }
  }

  /**
   * Decrypt sensitive configuration value using Web Crypto API
   * Implements AES-GCM decryption with PBKDF2 key derivation for Master Context compliance
   */
  private async decrypt(encryptedValue: string): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error(
        "Web Crypto API not available - cannot decrypt sensitive data"
      );
    }

    try {
      // Decode base64 to get combined salt + IV + encrypted data
      const combined = new Uint8Array(
        atob(encryptedValue)
          .split("")
          .map((char) => char.charCodeAt(0))
      );

      // Extract salt (first 16 bytes), IV (next 12 bytes), and encrypted data
      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const encryptedData = combined.slice(28);

      // Recreate the SAME key using the SAME master password and stored salt
      const masterPassword = "satnam-vault-master-key"; // TODO: Get from secure source
      const key = await this.deriveKey(masterPassword, salt);

      // Decrypt the data using the recreated key
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        encryptedData as BufferSource
      );

      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("Decryption failed:", error);
      // Fallback: try base64 decode for backward compatibility with old data
      try {
        return atob(encryptedValue);
      } catch (fallbackError) {
        console.error("Fallback decryption also failed:", fallbackError);
        throw new Error(
          "Failed to decrypt configuration value - data may be corrupted"
        );
      }
    }
  }
}

// Export singleton instance
let configManager: ConfigManager | null = null;

export function getConfigManager(vaultConfig?: VaultConfig): ConfigManager {
  if (!configManager && vaultConfig) {
    configManager = new ConfigManager(vaultConfig);
  }

  if (!configManager) {
    throw new Error(
      "ConfigManager not initialized. Provide vaultConfig on first call."
    );
  }

  return configManager;
}

// Export default configuration
export const defaultVaultConfig: VaultConfig = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-key",
  vaultTable: "vault_config",
};
