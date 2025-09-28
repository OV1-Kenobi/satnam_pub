/**
 * Configuration Management System - Master Context Compliant
 *
 * MASTER CONTEXT COMPLIANCE:
 * - Privacy-first configuration management (no sensitive data logging)
 * - Browser-compatible serverless environment with getEnvVar() pattern
 * - Lightning Network integration (PhoenixD, Breez, NWC, Voltage, Self-Hosted)
 * - eCash bridge configuration (Fedimint↔Cashu conversion patterns)
 * - Emergency recovery system integration
 * - Parent-offspring authorization relationship configuration
 * - Standardized role hierarchy support
 * - Vault-based sensitive configuration management
 */
import { z } from "zod";

/**
 * CRITICAL SECURITY: Configuration type definitions for Master Context compliance
 */
interface DatabaseConfig {
  url: string;
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

interface AuthConfig {
  tokenStorageKey: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  nostrAuthKind: number;
  nostrAuthChallenge: string;
  otpExpiryMinutes: number;
  maxOtpAttempts: number;
}

interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

interface RedisConfig {
  url: string;
}

interface NostrConfig {
  relayUrl: string;
  privateKey: string | undefined;
  relays: string[]; // Centralized relay list for clients
}

/**
 * MASTER CONTEXT: Lightning Network configuration for multi-node architecture
 * Supports Voltage, PhoenixD, Breez, NWC, and Self-Hosted nodes
 */
interface LightningConfig {
  // Legacy single node configuration (deprecated)
  nodeUrl: string | undefined;
  macaroon: string | undefined;
  certPath: string | undefined;

  // MASTER CONTEXT: Multi-node Lightning Network architecture
  voltage: {
    url: string | undefined;
    adminKey: string | undefined;
  };
  phoenixd: {
    url: string | undefined;
    macaroon: string | undefined;
  };
  breez: {
    config: string | undefined;
  };
  nwc: {
    connectionStrings: string | undefined;
  };
}

/**
 * MASTER CONTEXT: eCash bridge configuration for Fedimint↔Cashu conversion
 */
interface ECashBridgeConfig {
  fedimint: {
    federationUrl: string | undefined;
    guardianConfig: string | undefined;
  };
  cashu: {
    mintUrls: string[];
    defaultMint: string | undefined;
  };
  bridgeEnabled: boolean;
  conversionLimits: {
    dailyLimit: number;
    perTransactionLimit: number;
  };
}

/**
 * MASTER CONTEXT: Emergency recovery system configuration
 */
interface EmergencyRecoveryConfig {
  enabled: boolean;
  maxAttemptsPerDay: number;
  guardianConsensusThreshold: number;
  recoveryMethods: {
    password: boolean;
    shamir: boolean;
    multisig: boolean;
    guardianConsensus: boolean;
  };
  expirationHours: number;
}

/**
 * MASTER CONTEXT: Parent-offspring authorization relationship configuration
 */
interface ParentOffspringConfig {
  enabled: boolean;
  spendingLimits: {
    defaultDailyLimit: number;
    defaultWeeklyLimit: number;
    requiresApprovalAbove: number;
  };
  approvalTimeout: number; // hours
}

/**
 * MASTER CONTEXT: Role hierarchy configuration
 * Standardized roles: 'private'|'offspring'|'adult'|'steward'|'guardian'
 *
 * SOVEREIGNTY PRINCIPLE:
 * - Individual wallets are completely autonomous for Adults/Stewards/Guardians
 * - Family Federation authority is separate from individual financial sovereignty
 * - Only Offspring accounts have spending limits (parent-offspring authorization)
 */
interface RoleHierarchyConfig {
  standardizedRoles: readonly string[];
  rolePermissions: {
    [role: string]: {
      canCreateOffspring: boolean;
      canApprovePayments: boolean; // For offspring only, NOT individual wallets
      canAccessFamilyFunds: boolean; // Family Federation funds, NOT individual wallets
      canManageFamily: boolean; // Family Federation management authority
      spendingLimits: {
        daily: number; // -1 = no limit (sovereignty), positive = limit (offspring only)
        weekly: number; // -1 = no limit (sovereignty), positive = limit (offspring only)
        requiresApproval: number; // -1 = no approval (sovereignty), positive = threshold (offspring only)
      };
    };
  };
  deprecatedRoles: readonly string[]; // Roles that should be mapped to standardized roles
}

interface Nip05Config {
  domain: string;
}

interface FamilyConfig {
  domain: string;
  usernameMaxLength: string | number;
}

interface ServerConfig {
  port: number;
  host: string;
  environment: string;
  isProduction: boolean;
  isNetlify: boolean;
  isNetlifyFunction: boolean;
  isNetlifyEdgeFunction: boolean;
  deployContext: string;
  bitcoinSecurityLevel: "development" | "staging" | "production";
}

interface PubkyConfig {
  homeserverUrl: string;
  pkarrRelays: string[];
  enableMigration: string | boolean;
  sovereigntyTracking: string | boolean;
}

interface PkarrConfig {
  relayTimeout: string | number;
  recordTtl: string | number;
  backupRelays: string | number;
  publishRetries: string | number;
}

interface SupabaseConfig {
  url: string | undefined;
  serviceRoleKey: string | undefined;
  anonKey: string | undefined;
}

interface FeatureFlags {
  shamirSecretSharing: boolean;
  privacyMode: boolean;
  federatedSigning: boolean;
  guardianNotifications: boolean;
  nfcMfa: boolean;
}

interface DevelopmentConfig {
  enableDebugLogging: boolean;
  enableSqlLogging: boolean;
  enablePrivacyAudit: boolean;
}

interface PrivacyConfig {
  masterKey: string;
  jwtSecret: string;
  saltRounds: number;
}

/**
 * CRITICAL SECURITY: Master Context environment variable access pattern
 * Ensures browser compatibility with import.meta.env while maintaining serverless support
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = import.meta as { env?: Record<string, string> };
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

/**
 * CRITICAL SECURITY: Enhanced database URL parsing for Bitcoin banking platform
 * Parses DATABASE_URL with fallback to individual environment variables
 */
function parseDatabaseUrl(url?: string) {
  if (!url) {
    return {
      host: "localhost",
      port: 5432,
      name: "satnam_recovery",
      user: "postgres",
      password: "",
      ssl: false,
    };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      name: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
      ssl:
        parsed.hostname.includes("supabase.co") ||
        getEnvVar("DB_SSL") === "true",
    };
  } catch {
    console.warn("Failed to parse DATABASE_URL, using individual env vars");
    return {
      host: getEnvVar("DB_HOST") || "localhost",
      port: parseInt(getEnvVar("DB_PORT") || "5432"),
      name: getEnvVar("DB_NAME") || "satnam_recovery",
      user: getEnvVar("DB_USER") || "postgres",
      password: getEnvVar("DB_PASSWORD") || "",
      ssl: getEnvVar("DB_SSL") === "true",
    };
  }
}

// Validate critical environment variables (lazy construction to avoid TDZ/cycle issues in browser builds)
function getEnvSchema() {
  return z.object({
    JWT_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    API_BASE_URL: z.string().url().optional(),
    JWT_EXPIRES_IN: z.string().optional(),
    NOSTR_AUTH_CHALLENGE: z.string().optional(),
    DATABASE_SSL: z.coerce.boolean().optional(),
    PORT: z.coerce.number().int().positive().optional(),
    NOSTR_RELAY_URL: z.string().url().optional(),
    NOSTR_PRIVATE_KEY: z.string().optional(),
    LIGHTNING_NODE_URL: z.string().url().optional(),
    LIGHTNING_MACAROON: z.string().optional(),
    LIGHTNING_CERT_PATH: z.string().optional(),
    VOLTAGE_LNBITS_URL: z.string().url().optional(),
    VITE_VOLTAGE_LNBITS_URL: z.string().url().optional(),
    VOLTAGE_LNBITS_ADMIN_KEY: z.string().optional(),
    VITE_VOLTAGE_LNBITS_ADMIN_KEY: z.string().optional(),
    PHOENIXD_NODE_URL: z.string().url().optional(),
    PHOENIXD_MACAROON: z.string().optional(),
    BREEZ_NODE_CONFIG: z.string().optional(),
    NWC_CONNECTION_STRINGS: z.string().optional(),
    NIP05_DOMAIN: z.string().optional(),
    FAMILY_DOMAIN: z.string().optional(),
    FAMILY_USERNAME_MAX_LENGTH: z.coerce.number().int().positive().optional(),

    // supabase
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

    // bitcoin security
    PRIVACY_MASTER_KEY: z.string().min(32).optional(),
    BITCOIN_RPC_USER: z.string().optional(),
    BITCOIN_RPC_PASSWORD: z.string().min(16).optional(),
    BITCOIN_RPC_HOST: z.string().optional(),
    BITCOIN_RPC_PORT: z.coerce.number().int().positive().optional(),

    // database individual variables
    DB_HOST: z.string().optional(),
    DB_PORT: z.coerce.number().int().positive().optional(),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_SSL: z.coerce.boolean().optional(),

    // feature flags
    ENABLE_SSS: z.coerce.boolean().optional(),
    ENABLE_PRIVACY_MODE: z.coerce.boolean().optional(),
    ENABLE_FEDERATED_SIGNING: z.coerce.boolean().optional(),
    ENABLE_GUARDIAN_NOTIFICATIONS: z.coerce.boolean().optional(),

    // development flags
    DEBUG_LOGGING: z.coerce.boolean().optional(),
    SQL_LOGGING: z.coerce.boolean().optional(),
    PRIVACY_AUDIT: z.coerce.boolean().optional(),

    // server configuration
    HOST: z.string().optional(),
    SALT_ROUNDS: z.coerce.number().int().positive().optional(),

    // pubky / pkarr
    PUBKY_HOMESERVER_URL: z.string().url().optional(),
    PUBKY_PKARR_RELAYS: z.string().optional(),
    PUBKY_ENABLE_MIGRATION: z.coerce.boolean().optional(),
    PUBKY_SOVEREIGNTY_TRACKING: z.coerce.boolean().optional(),
    PKARR_RELAY_TIMEOUT: z.coerce.number().int().nonnegative().optional(),
    PKARR_RECORD_TTL: z.coerce.number().int().nonnegative().optional(),
    PKARR_BACKUP_RELAYS: z.coerce.number().int().nonnegative().optional(),
    PKARR_PUBLISH_RETRIES: z.coerce.number().int().nonnegative().optional(),
  });
}

/**
 * CRITICAL SECURITY: Dynamic environment object creation for Master Context compliance
 * Creates environment object using getEnvVar() pattern for browser-serverless compatibility
 */
function createDynamicEnvironmentObject() {
  return {
    JWT_SECRET: getEnvVar("JWT_SECRET"),
    DATABASE_URL: getEnvVar("DATABASE_URL"),
    REDIS_URL: getEnvVar("REDIS_URL"),
    NODE_ENV: getEnvVar("NODE_ENV"),
    API_BASE_URL: getEnvVar("API_BASE_URL"),
    JWT_EXPIRES_IN: getEnvVar("JWT_EXPIRES_IN"),
    NOSTR_AUTH_CHALLENGE: getEnvVar("NOSTR_AUTH_CHALLENGE"),
    DATABASE_SSL: getEnvVar("DATABASE_SSL"),
    PORT: getEnvVar("PORT"),
    NOSTR_RELAY_URL: getEnvVar("NOSTR_RELAY_URL"),
    NOSTR_PRIVATE_KEY: getEnvVar("NOSTR_PRIVATE_KEY"),
    LIGHTNING_NODE_URL: getEnvVar("LIGHTNING_NODE_URL"),
    LIGHTNING_MACAROON: getEnvVar("LIGHTNING_MACAROON"),
    LIGHTNING_CERT_PATH: getEnvVar("LIGHTNING_CERT_PATH"),
    VOLTAGE_LNBITS_URL: getEnvVar("VOLTAGE_LNBITS_URL"),
    VITE_VOLTAGE_LNBITS_URL: getEnvVar("VITE_VOLTAGE_LNBITS_URL"),
    VOLTAGE_LNBITS_ADMIN_KEY: getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY"),
    VITE_VOLTAGE_LNBITS_ADMIN_KEY: getEnvVar("VITE_VOLTAGE_LNBITS_ADMIN_KEY"),
    PHOENIXD_NODE_URL: getEnvVar("PHOENIXD_NODE_URL"),
    PHOENIXD_MACAROON: getEnvVar("PHOENIXD_MACAROON"),
    BREEZ_NODE_CONFIG: getEnvVar("BREEZ_NODE_CONFIG"),
    NWC_CONNECTION_STRINGS: getEnvVar("NWC_CONNECTION_STRINGS"),
    NIP05_DOMAIN: getEnvVar("NIP05_DOMAIN"),
    FAMILY_DOMAIN: getEnvVar("FAMILY_DOMAIN"),
    FAMILY_USERNAME_MAX_LENGTH: getEnvVar("FAMILY_USERNAME_MAX_LENGTH"),
    PUBKY_HOMESERVER_URL: getEnvVar("PUBKY_HOMESERVER_URL"),
    PUBKY_PKARR_RELAYS: getEnvVar("PUBKY_PKARR_RELAYS"),
    PUBKY_ENABLE_MIGRATION: getEnvVar("PUBKY_ENABLE_MIGRATION"),
    PUBKY_SOVEREIGNTY_TRACKING: getEnvVar("PUBKY_SOVEREIGNTY_TRACKING"),
    PKARR_RELAY_TIMEOUT: getEnvVar("PKARR_RELAY_TIMEOUT"),
    PKARR_RECORD_TTL: getEnvVar("PKARR_RECORD_TTL"),
    PKARR_BACKUP_RELAYS: getEnvVar("PKARR_BACKUP_RELAYS"),
    PKARR_PUBLISH_RETRIES: getEnvVar("PKARR_PUBLISH_RETRIES"),
    NEXT_PUBLIC_SUPABASE_URL: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_URL: getEnvVar("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: getEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_ANON_KEY: getEnvVar("SUPABASE_ANON_KEY"),
    PRIVACY_MASTER_KEY: getEnvVar("PRIVACY_MASTER_KEY"),
    BITCOIN_RPC_USER: getEnvVar("BITCOIN_RPC_USER"),
    BITCOIN_RPC_PASSWORD: getEnvVar("BITCOIN_RPC_PASSWORD"),
    BITCOIN_RPC_HOST: getEnvVar("BITCOIN_RPC_HOST"),
    BITCOIN_RPC_PORT: getEnvVar("BITCOIN_RPC_PORT"),
    DB_HOST: getEnvVar("DB_HOST"),
    DB_PORT: getEnvVar("DB_PORT"),
    DB_NAME: getEnvVar("DB_NAME"),
    DB_USER: getEnvVar("DB_USER"),
    DB_PASSWORD: getEnvVar("DB_PASSWORD"),
    DB_SSL: getEnvVar("DB_SSL"),
    ENABLE_SSS: getEnvVar("ENABLE_SSS"),
    ENABLE_PRIVACY_MODE: getEnvVar("ENABLE_PRIVACY_MODE"),
    ENABLE_FEDERATED_SIGNING: getEnvVar("ENABLE_FEDERATED_SIGNING"),
    ENABLE_GUARDIAN_NOTIFICATIONS: getEnvVar("ENABLE_GUARDIAN_NOTIFICATIONS"),
    DEBUG_LOGGING: getEnvVar("DEBUG_LOGGING"),
    SQL_LOGGING: getEnvVar("SQL_LOGGING"),
    PRIVACY_AUDIT: getEnvVar("PRIVACY_AUDIT"),
    HOST: getEnvVar("HOST"),
    SALT_ROUNDS: getEnvVar("SALT_ROUNDS"),
  };
}

/**
 * CRITICAL SECURITY: Bitcoin Banking Platform Environment Validation
 * Validates environment variables for Bitcoin security requirements
 */
function validateEnvironmentForBitcoinBanking(): void {
  // Skip server-side env validation in browser builds to avoid bundling/time-of-eval issues
  if (typeof window !== "undefined") return;
  const dynamicEnv = createDynamicEnvironmentObject();
  const envValidation = getEnvSchema().safeParse(dynamicEnv);

  if (!envValidation.success) {
    const errors = envValidation.error.format();

    // Add Bitcoin security context to validation errors
    const bitcoinSecurityContext = {
      deploymentContext: getEnvVar("CONTEXT") || "unknown",
      isNetlifyDeployment: !!(
        getEnvVar("NETLIFY") || getEnvVar("DEPLOY_PRIME_URL")
      ),
      nodeEnvironment: getEnvVar("NODE_ENV") || "development",
      validationTimestamp: new Date().toISOString(),
      criticalSecurityVars: {
        jwtSecret: !!dynamicEnv.JWT_SECRET,
        supabaseUrl: !!dynamicEnv.SUPABASE_URL,
        supabaseServiceKey: !!dynamicEnv.SUPABASE_SERVICE_ROLE_KEY,
        privacyMasterKey: !!dynamicEnv.PRIVACY_MASTER_KEY,
        bitcoinRpcCredentials: !!(
          dynamicEnv.BITCOIN_RPC_USER && dynamicEnv.BITCOIN_RPC_PASSWORD
        ),
        lightningNodeUrl: !!dynamicEnv.LIGHTNING_NODE_URL,
      },
    };

    throw new Error(
      `Bitcoin Banking Platform Environment Validation Failed:\n` +
        `Security Context: ${JSON.stringify(
          bitcoinSecurityContext,
          null,
          2
        )}\n` +
        `Validation Errors: ${JSON.stringify(errors, null, 2)}`
    );
  }
}

/**
 * API configuration
 */
export const apiConfig: ApiConfig = {
  baseUrl: getEnvVar("API_BASE_URL") || "https://api.satnam.pub",
  timeout: 30000,
};

/**
 * Authentication configuration
 */
function getJwtSecret(): string {
  // Browser builds must not enforce server secrets
  if (typeof window !== "undefined") {
    return "browser-stub-jwt-secret";
  }
  const secret = getEnvVar("JWT_SECRET");
  if (secret) return secret;
  const nodeEnv = (getEnvVar("NODE_ENV") || "").toLowerCase();
  if (nodeEnv === "production") {
    throw new Error(
      "JWT_SECRET environment variable is required in production"
    );
  }
  // Development fallback (server-side only)
  const array = new Uint8Array(32);
  const webCrypto = (globalThis as any).crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(array);
  } else {
    for (let i = 0; i < array.length; i++) array[i] = (i * 7 + 13) & 0xff;
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export const authConfig: AuthConfig = {
  tokenStorageKey: "satnam_auth_token",
  get jwtSecret() {
    return getJwtSecret();
  },
  jwtExpiresIn: getEnvVar("JWT_EXPIRES_IN") || "7d",
  nostrAuthKind: 27235,
  nostrAuthChallenge:
    getEnvVar("NOSTR_AUTH_CHALLENGE") ||
    "satnam_auth_" + Math.floor(Date.now() / 1000).toString(),
  otpExpiryMinutes: 10,
  maxOtpAttempts: 3,
};

/**
 * Database configuration with enhanced URL parsing
 */
export const dbConfig: DatabaseConfig = {
  url: getEnvVar("DATABASE_URL") || "postgres://localhost:5432/identity_forge",
  ...parseDatabaseUrl(getEnvVar("DATABASE_URL")),
};

/**
 * Redis configuration
 */
export const redisConfig: RedisConfig = {
  url: getEnvVar("REDIS_URL") || "redis://localhost:6379",
};

/**
 * Nostr configuration
 */
export const nostrConfig: NostrConfig = {
  relayUrl:
    getEnvVar("NOSTR_RELAY_URL") ||
    (() => {
      const defaultUrl = "wss://relay.damus.io";
      if (
        getEnvVar("NODE_ENV") === "production" &&
        !getEnvVar("NOSTR_RELAY_URL")
      ) {
        // Fall back to default relay URL in non-production environments
      }
      return defaultUrl;
    })(),
  privateKey: getEnvVar("NOSTR_PRIVATE_KEY"),
  relays: (() => {
    const csv = getEnvVar("VITE_NOSTR_RELAYS") || getEnvVar("NOSTR_RELAYS");
    const fallback =
      "wss://nos.lol,wss://relay.damus.io,wss://relay.nostr.band";
    return (csv || fallback)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  })(),
};

/**
 * MASTER CONTEXT: Lightning Network configuration - Multi-node architecture
 * Supports Voltage, PhoenixD, Breez, NWC, and Self-Hosted nodes
 */
export const lightningConfig: LightningConfig = {
  // Legacy configuration (maintained for backward compatibility)
  nodeUrl: getEnvVar("LIGHTNING_NODE_URL"),
  macaroon: getEnvVar("LIGHTNING_MACAROON"),
  certPath: getEnvVar("LIGHTNING_CERT_PATH"),

  // MASTER CONTEXT: Multi-node Lightning Network architecture
  voltage: {
    url:
      getEnvVar("VOLTAGE_LNBITS_URL") || getEnvVar("VITE_VOLTAGE_LNBITS_URL"),
    adminKey:
      getEnvVar("VOLTAGE_LNBITS_ADMIN_KEY") ||
      getEnvVar("VITE_VOLTAGE_LNBITS_ADMIN_KEY"),
  },
  phoenixd: {
    url: getEnvVar("PHOENIXD_NODE_URL"),
    macaroon: getEnvVar("PHOENIXD_MACAROON"),
  },
  breez: {
    config: getEnvVar("BREEZ_NODE_CONFIG"),
  },
  nwc: {
    connectionStrings: getEnvVar("NWC_CONNECTION_STRINGS"),
  },
};

/**
 * NIP-05 configuration
 */
export const nip05Config: Nip05Config = {
  domain: getEnvVar("NIP05_DOMAIN") || "yourdomain.com",
};

/**
 * Family member configuration
 */
export const familyConfig: FamilyConfig = {
  domain: getEnvVar("FAMILY_DOMAIN") || "satnam.pub",
  usernameMaxLength: getEnvVar("FAMILY_USERNAME_MAX_LENGTH") || 20,
};

/**
 * CRITICAL SECURITY: Bitcoin-only banking platform security validation
 * Validates production environment for Bitcoin security requirements
 */
function validateBitcoinSecurityRequirements(environment: string): void {
  if (environment === "production") {
    // Validate critical Bitcoin security environment variables
    const requiredSecurityVars = [
      "JWT_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "PRIVACY_MASTER_KEY",
    ];

    for (const varName of requiredSecurityVars) {
      const value = getEnvVar(varName);
      if (!value || value.length < 32) {
        throw new Error(
          `BITCOIN SECURITY VIOLATION: ${varName} must be at least 32 characters in production`
        );
      }
    }

    // Validate Bitcoin RPC credentials if provided
    const bitcoinRpcUser = getEnvVar("BITCOIN_RPC_USER");
    const bitcoinRpcPassword = getEnvVar("BITCOIN_RPC_PASSWORD");
    if (bitcoinRpcUser || bitcoinRpcPassword) {
      if (!bitcoinRpcUser || !bitcoinRpcPassword) {
        throw new Error(
          "BITCOIN SECURITY VIOLATION: Both BITCOIN_RPC_USER and BITCOIN_RPC_PASSWORD must be provided together"
        );
      }
      if (bitcoinRpcPassword.length < 16) {
        throw new Error(
          "BITCOIN SECURITY VIOLATION: BITCOIN_RPC_PASSWORD must be at least 16 characters in production"
        );
      }
    }

    // Validate Lightning Network credentials if provided
    const lightningNodeUrl = getEnvVar("LIGHTNING_NODE_URL");
    const lightningMacaroon = getEnvVar("LIGHTNING_MACAROON");
    if (lightningNodeUrl && !lightningMacaroon) {
      throw new Error(
        "BITCOIN SECURITY VIOLATION: LIGHTNING_MACAROON required when LIGHTNING_NODE_URL is provided in production"
      );
    }

    // Validate Bitcoin RPC port if provided
    const bitcoinRpcPort = getEnvVar("BITCOIN_RPC_PORT");
    if (bitcoinRpcPort) {
      const port = parseInt(bitcoinRpcPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(
          `BITCOIN SECURITY VIOLATION: BITCOIN_RPC_PORT must be a valid port number (1-65535), got: ${bitcoinRpcPort}`
        );
      }
    }

    // Validate Supabase URL for production
    const supabaseUrl =
      getEnvVar("SUPABASE_URL") || getEnvVar("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseUrl || !supabaseUrl.includes("supabase.co")) {
      throw new Error(
        "BITCOIN SECURITY VIOLATION: Valid Supabase URL required in production"
      );
    }

    // Validate NODE_ENV is explicitly set to production
    if (getEnvVar("NODE_ENV") !== "production") {
      throw new Error(
        'BITCOIN SECURITY VIOLATION: NODE_ENV must be explicitly set to "production"'
      );
    }
  }
}

/**
 * CRITICAL SECURITY: Dynamic server configuration factory for Bitcoin-only banking platform
 * Handles environment variables correctly across Netlify Functions, Edge Functions, and client builds
 */
function createServerConfig(): ServerConfig {
  // CRITICAL: Validate all environment variables first for Bitcoin banking security
  validateEnvironmentForBitcoinBanking();

  const portEnv = getEnvVar("PORT");
  const port = portEnv ? parseInt(portEnv, 10) : 3000;

  // Production validation - Bitcoin security critical
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value: ${portEnv}. Must be 1-65535 for production.`
    );
  }

  const environment =
    getEnvVar("NODE_ENV") ||
    (getEnvVar("NETLIFY") ? "production" : "development");

  // Environment validation for production
  if (!["development", "production", "test"].includes(environment)) {
    throw new Error(
      `Invalid NODE_ENV: ${environment}. Must be development, production, or test.`
    );
  }

  const isProduction = environment === "production";
  const isNetlify = !!(getEnvVar("NETLIFY") || getEnvVar("DEPLOY_PRIME_URL"));
  const isNetlifyFunction = !!(
    getEnvVar("NETLIFY_DEV") || getEnvVar("AWS_LAMBDA_FUNCTION_NAME")
  );
  const isNetlifyEdgeFunction = !!getEnvVar("NETLIFY_EDGE_FUNCTION");

  // Determine deployment context for Bitcoin security
  const deployContext =
    getEnvVar("CONTEXT") ||
    (isProduction
      ? "production"
      : getEnvVar("DEPLOY_PRIME_URL")
      ? "deploy-preview"
      : "development");

  // Bitcoin security level based on deployment context
  const bitcoinSecurityLevel: "development" | "staging" | "production" =
    deployContext === "production"
      ? "production"
      : deployContext === "deploy-preview"
      ? "staging"
      : "development";

  // CRITICAL: Validate Bitcoin security requirements for production
  validateBitcoinSecurityRequirements(environment);

  return {
    port,
    host: getEnvVar("HOST") || "localhost",
    environment,
    isProduction,
    isNetlify,
    isNetlifyFunction,
    isNetlifyEdgeFunction,
    deployContext,
    bitcoinSecurityLevel,
  };
}

// Cached export for production performance
let cachedConfig: ServerConfig | null = null;
let validationCached: boolean = false;

export function getServerConfig(): ServerConfig {
  // Server-only guard
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerConfig() is server-only and must not be called in browser builds"
    );
  }
  if (!cachedConfig) {
    cachedConfig = createServerConfig();
    validationCached = true;
  }
  return cachedConfig;
}

// Testing utilities
export function resetServerConfig(): void {
  cachedConfig = null;
  validationCached = false;
}

/**
 * CRITICAL SECURITY: Force environment validation without creating full config
 * Useful for startup validation in serverless functions
 */
export function validateEnvironment(): void {
  if (!validationCached) {
    validateEnvironmentForBitcoinBanking();
    validationCached = true;
  }
}

/**
 * CRITICAL SECURITY: Get validation status for monitoring
 */
export function isEnvironmentValidated(): boolean {
  return validationCached;
}

/**
 * CRITICAL SECURITY: Get current environment object for debugging
 * Only use in development - never log in production
 */
export function getEnvironmentDebugInfo(): Record<string, boolean> {
  if (getEnvVar("NODE_ENV") === "production") {
    throw new Error(
      "Environment debug info not available in production for security"
    );
  }

  const dynamicEnv = createDynamicEnvironmentObject();
  const debugInfo: Record<string, boolean> = {};

  Object.keys(dynamicEnv).forEach((key) => {
    debugInfo[key] = !!(dynamicEnv as any)[key];
  });

  return debugInfo;
}

/**
 * CRITICAL SECURITY: Validate configuration for Bitcoin banking platform
 * Checks required configuration and Bitcoin security requirements
 */
export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  // Check critical Supabase configuration
  if (!supabaseConfig.url) {
    missing.push("SUPABASE_URL");
  }
  // Service role key must never be required in app/runtime config

  // Check Bitcoin security requirements in production
  const serverConf = getServerConfig();
  if (serverConf.isProduction) {
    if (privacy.masterKey.includes("dev-master-key")) {
      missing.push("PRIVACY_MASTER_KEY (using dev key in production)");
    }
    if (privacy.jwtSecret.includes("dev-jwt-secret")) {
      missing.push("JWT_SECRET (using dev secret in production)");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * BITCOIN SECURITY: Utility functions for Bitcoin-only banking platform
 */
export function isBitcoinProductionReady(): boolean {
  try {
    const config = getServerConfig();
    return (
      config.bitcoinSecurityLevel === "production" &&
      config.isProduction &&
      config.isNetlify
    );
  } catch {
    return false;
  }
}

export function getBitcoinDeploymentInfo(): {
  environment: string;
  securityLevel: string;
  deployContext: string;
  isNetlifyDeployment: boolean;
  isFunctionContext: boolean;
  isEdgeFunctionContext: boolean;
} {
  const config = getServerConfig();
  return {
    environment: config.environment,
    securityLevel: config.bitcoinSecurityLevel,
    deployContext: config.deployContext,
    isNetlifyDeployment: config.isNetlify,
    isFunctionContext: config.isNetlifyFunction,
    isEdgeFunctionContext: config.isNetlifyEdgeFunction,
  };
}

/**
 * Pubky configuration
 */
export const pubkyConfig: PubkyConfig = {
  homeserverUrl:
    getEnvVar("PUBKY_HOMESERVER_URL") || "https://homeserver.pubky.app",
  pkarrRelays: (
    getEnvVar("PUBKY_PKARR_RELAYS") ||
    "https://relay1.pubky.app,https://relay2.pubky.app"
  ).split(","),
  enableMigration: getEnvVar("PUBKY_ENABLE_MIGRATION") || false,
  sovereigntyTracking: getEnvVar("PUBKY_SOVEREIGNTY_TRACKING") || false,
};

/**
 * Pkarr configuration
 */
export const pkarrConfig: PkarrConfig = {
  relayTimeout: getEnvVar("PKARR_RELAY_TIMEOUT") || 5000,
  recordTtl: getEnvVar("PKARR_RECORD_TTL") || 3600,
  backupRelays: getEnvVar("PKARR_BACKUP_RELAYS") || 3,
  publishRetries: getEnvVar("PKARR_PUBLISH_RETRIES") || 3,
};

/**
 * Supabase configuration
 */
export const supabaseConfig: SupabaseConfig = {
  url: getEnvVar("NEXT_PUBLIC_SUPABASE_URL") || getEnvVar("SUPABASE_URL"),
  serviceRoleKey: undefined, // Do not expose service role in app runtime config
  anonKey:
    getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    getEnvVar("SUPABASE_ANON_KEY"),
};

/**
 * NFC Physical MFA configuration
 */
interface NFCConfig {
  enabled: boolean;
  pinTimeoutMs: number;
  confirmationMode: "per_unlock" | "per_operation";
  defaultProgramUrl: string; // Default URL to program into NTAG424
}

export const nfcConfig: NFCConfig = {
  enabled: (getEnvVar("VITE_ENABLE_NFC_MFA") || "false") === "true",
  pinTimeoutMs: parseInt(getEnvVar("VITE_NFC_PIN_TIMEOUT") || "120000"),
  confirmationMode: (getEnvVar("VITE_NFC_CONFIRMATION_MODE") ||
    "per_unlock") as "per_unlock" | "per_operation",
  defaultProgramUrl:
    getEnvVar("VITE_NFC_DEFAULT_PROGRAM_URL") ||
    "https://www.satnam.pub/id/profile.json",
};

/**
 * Feature flags configuration
 */
export const features: FeatureFlags = {
  shamirSecretSharing: getEnvVar("ENABLE_SSS") !== "false",
  privacyMode: getEnvVar("ENABLE_PRIVACY_MODE") !== "false",
  federatedSigning: getEnvVar("ENABLE_FEDERATED_SIGNING") !== "false",
  guardianNotifications: getEnvVar("ENABLE_GUARDIAN_NOTIFICATIONS") !== "false",
  nfcMfa: (getEnvVar("VITE_ENABLE_NFC_MFA") || "false") === "true",
};

/**
 * Development configuration
 */
export const dev: DevelopmentConfig = {
  enableDebugLogging: getEnvVar("DEBUG_LOGGING") === "true",
  enableSqlLogging: getEnvVar("SQL_LOGGING") === "true",
  enablePrivacyAudit: getEnvVar("PRIVACY_AUDIT") !== "false",
};

/**
 * MASTER CONTEXT: eCash bridge configuration for Fedimint↔Cashu conversion
 */
export const ecashBridgeConfig: ECashBridgeConfig = {
  fedimint: {
    federationUrl: getEnvVar("FEDIMINT_FEDERATION_URL"),
    guardianConfig: getEnvVar("FEDIMINT_GUARDIAN_CONFIG"),
  },
  cashu: {
    mintUrls: (getEnvVar("CASHU_MINT_URLS") || "").split(",").filter(Boolean),
    defaultMint: getEnvVar("CASHU_DEFAULT_MINT"),
  },
  bridgeEnabled: getEnvVar("ECASH_BRIDGE_ENABLED") !== "false",
  conversionLimits: {
    dailyLimit: parseInt(getEnvVar("ECASH_DAILY_LIMIT") || "1000000"), // 1M sats
    perTransactionLimit: parseInt(getEnvVar("ECASH_TX_LIMIT") || "100000"), // 100K sats
  },
};

/**
 * MASTER CONTEXT: Emergency recovery system configuration
 */
export const emergencyRecoveryConfig: EmergencyRecoveryConfig = {
  enabled: getEnvVar("EMERGENCY_RECOVERY_ENABLED") !== "false",
  maxAttemptsPerDay: parseInt(
    getEnvVar("EMERGENCY_RECOVERY_MAX_ATTEMPTS") || "3"
  ),
  guardianConsensusThreshold: parseInt(
    getEnvVar("GUARDIAN_CONSENSUS_THRESHOLD") || "2"
  ),
  recoveryMethods: {
    password: getEnvVar("RECOVERY_METHOD_PASSWORD") !== "false",
    shamir: getEnvVar("RECOVERY_METHOD_SHAMIR") !== "false",
    multisig: getEnvVar("RECOVERY_METHOD_MULTISIG") !== "false",
    guardianConsensus: getEnvVar("RECOVERY_METHOD_GUARDIAN") !== "false",
  },
  expirationHours: parseInt(getEnvVar("RECOVERY_EXPIRATION_HOURS") || "24"),
};

/**
 * MASTER CONTEXT: Parent-offspring authorization relationship configuration
 */
export const parentOffspringConfig: ParentOffspringConfig = {
  enabled: getEnvVar("PARENT_OFFSPRING_AUTH_ENABLED") !== "false",
  spendingLimits: {
    defaultDailyLimit: parseInt(getEnvVar("OFFSPRING_DAILY_LIMIT") || "50000"), // 50K sats
    defaultWeeklyLimit: parseInt(
      getEnvVar("OFFSPRING_WEEKLY_LIMIT") || "200000"
    ), // 200K sats
    requiresApprovalAbove: parseInt(
      getEnvVar("OFFSPRING_APPROVAL_THRESHOLD") || "10000"
    ), // 10K sats
  },
  approvalTimeout: parseInt(getEnvVar("PARENT_APPROVAL_TIMEOUT") || "24"), // 24 hours
};

/**
 * MASTER CONTEXT: Role hierarchy configuration
 * Standardized roles with permissions and spending limits
 */
export const roleHierarchyConfig: RoleHierarchyConfig = {
  standardizedRoles: [
    "private",
    "offspring",
    "adult",
    "steward",
    "guardian",
  ] as const,
  rolePermissions: {
    private: {
      canCreateOffspring: false,
      canApprovePayments: false,
      canAccessFamilyFunds: false,
      canManageFamily: false,
      spendingLimits: {
        daily: -1, // SOVEREIGNTY: No limits on individual wallet
        weekly: -1, // SOVEREIGNTY: No limits on individual wallet
        requiresApproval: -1, // SOVEREIGNTY: No approval required for individual wallet
      },
    },
    offspring: {
      canCreateOffspring: false,
      canApprovePayments: false,
      canAccessFamilyFunds: false,
      canManageFamily: false,
      spendingLimits: {
        daily: parseInt(getEnvVar("OFFSPRING_DAILY_LIMIT") || "50000"), // 50K sats
        weekly: parseInt(getEnvVar("OFFSPRING_WEEKLY_LIMIT") || "200000"), // 200K sats
        requiresApproval: parseInt(
          getEnvVar("OFFSPRING_APPROVAL_THRESHOLD") || "10000"
        ), // 10K sats
      },
    },
    adult: {
      canCreateOffspring: true,
      canApprovePayments: true, // SOVEREIGNTY: For their own offspring only, NOT their individual wallet
      canAccessFamilyFunds: true,
      canManageFamily: false,
      spendingLimits: {
        daily: -1, // SOVEREIGNTY: No limits on individual wallet
        weekly: -1, // SOVEREIGNTY: No limits on individual wallet
        requiresApproval: -1, // SOVEREIGNTY: No approval required for individual wallet
      },
    },
    steward: {
      canCreateOffspring: true,
      canApprovePayments: true, // SOVEREIGNTY: For offspring only, NOT their individual wallet
      canAccessFamilyFunds: true,
      canManageFamily: true, // SOVEREIGNTY: Family Federation management authority
      spendingLimits: {
        daily: -1, // SOVEREIGNTY: No limits on individual wallet
        weekly: -1, // SOVEREIGNTY: No limits on individual wallet
        requiresApproval: -1, // SOVEREIGNTY: No approval required for individual wallet
      },
    },
    guardian: {
      canCreateOffspring: true,
      canApprovePayments: true, // SOVEREIGNTY: For offspring only, NOT their individual wallet
      canAccessFamilyFunds: true,
      canManageFamily: true, // SOVEREIGNTY: Passive oversight of Family Federation, NOT financial control
      spendingLimits: {
        daily: -1, // SOVEREIGNTY: No limits on individual wallet
        weekly: -1, // SOVEREIGNTY: No limits on individual wallet
        requiresApproval: -1, // SOVEREIGNTY: No approval required for individual wallet
      },
    },
  },
  deprecatedRoles: ["parent", "child", "teen"] as const, // Map to 'adult', 'offspring', 'offspring'
};

/**
 * Privacy & Security configuration
 */
export const privacy: PrivacyConfig = {
  masterKey: (() => {
    const envKey = getEnvVar("PRIVACY_MASTER_KEY");
    if (envKey) return envKey;

    const isBrowser = typeof window !== "undefined";
    const nodeEnv = (getEnvVar("NODE_ENV") || "").toLowerCase();

    // In browser builds, never require PRIVACY_MASTER_KEY; client runtime retrieves from Supabase Vault
    if (!isBrowser && nodeEnv === "production") {
      throw new Error(
        "PRIVACY_MASTER_KEY environment variable is required in production"
      );
    }

    return "dev-master-key-change-in-production-please-use-strong-random-key";
  })(),
  jwtSecret:
    getEnvVar("JWT_SECRET") ||
    (() => {
      const isBrowser = typeof window !== "undefined";
      if (
        !isBrowser &&
        (getEnvVar("NODE_ENV") || "").toLowerCase() === "production"
      ) {
        throw new Error(
          "JWT_SECRET environment variable is required in production"
        );
      }
      return "dev-jwt-secret-change-in-production";
    })(),
  saltRounds: parseInt(getEnvVar("SALT_ROUNDS") || "12"),
};

/**
 * Feature flags
 */
export const featureFlags = {
  enableFamilyDashboard: true,
  enableIdentityForge: true,
  enableNostrEcosystem: true,
  enableEducationPlatform: true,
};

// Export a unified config object for convenience (lazy getters; no top-level evaluation)
const __config: any = {};
Object.defineProperties(__config, {
  api: { get: () => apiConfig, enumerable: true },
  auth: { get: () => authConfig, enumerable: true },
  database: { get: () => dbConfig, enumerable: true },
  redis: { get: () => redisConfig, enumerable: true },
  nostr: { get: () => nostrConfig, enumerable: true },
  lightning: { get: () => lightningConfig, enumerable: true },
  nip05: { get: () => nip05Config, enumerable: true },
  family: { get: () => familyConfig, enumerable: true },
  nfc: { get: () => nfcConfig, enumerable: true },
  server: { get: () => getServerConfig(), enumerable: true },
  pubky: { get: () => pubkyConfig, enumerable: true },
  pkarr: { get: () => pkarrConfig, enumerable: true },
  supabase: { get: () => supabaseConfig, enumerable: true },
  features: { get: () => features, enumerable: true },
  development: { get: () => dev, enumerable: true },
  privacy: { get: () => privacy, enumerable: true },
});
export const config = __config as {
  api: typeof apiConfig;
  auth: typeof authConfig;
  database: typeof dbConfig;
  redis: typeof redisConfig;
  nostr: typeof nostrConfig;
  lightning: typeof lightningConfig;
  nip05: typeof nip05Config;
  family: typeof familyConfig;
  nfc: typeof nfcConfig;
  server: ServerConfig;
  pubky: typeof pubkyConfig;
  pkarr: typeof pkarrConfig;
  supabase: typeof supabaseConfig;
  features: typeof features;
  development: typeof dev;
  privacy: typeof privacy;
};

// Backward compatibility exports for config.ts migration (lazy)
export const db = dbConfig;
export const supabase = supabaseConfig;
export const server = new Proxy({} as ServerConfig, {
  get: (_t, p) => (getServerConfig() as any)[p as any],
  has: (_t, p) => p in (getServerConfig() as any),
  ownKeys: () => Reflect.ownKeys(getServerConfig() as any),
  getOwnPropertyDescriptor: (_t, p) =>
    Object.getOwnPropertyDescriptor(getServerConfig() as any, p),
}) as unknown as ServerConfig;
export const api = apiConfig;
export const app = { baseUrl: "https://satnam.pub" };
export { nostrConfig as nostr, redisConfig as redis };

// MIGRATION COMPATIBILITY: Legacy property access
// @deprecated Use server.environment instead of server.nodeEnv
try {
  Object.defineProperty(server as any, "nodeEnv", {
    get() {
      console.warn(
        "DEPRECATION WARNING: server.nodeEnv is deprecated. Use server.environment instead."
      );
      return (getServerConfig() as any).environment;
    },
    enumerable: false,
    configurable: false,
  });
} catch {
  // Ignore if defineProperty fails in unusual environments
}

// Default export for compatibility
export default config;
