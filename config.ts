/**
 * @fileoverview Configuration file for Satnam Recovery
 * @description Centralized configuration with environment variable fallbacks
 */

import * as dotenv from "dotenv";

// Load environment variables from .env.local first, then .env
dotenv.config({ path: ".env.local" });
dotenv.config();

// Parse DATABASE_URL if provided
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
      name: parsed.pathname.slice(1), // Remove leading slash
      user: parsed.username,
      password: parsed.password,
      ssl:
        parsed.hostname.includes("supabase.co") ||
        process.env.DB_SSL === "true",
    };
  } catch (error) {
    console.warn("Failed to parse DATABASE_URL, using individual env vars");
    return {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      name: process.env.DB_NAME || "satnam_recovery",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      ssl: process.env.DB_SSL === "true",
    };
  }
}

export const config = {
  // Database Configuration
  database: parseDatabaseUrl(process.env.DATABASE_URL),

  // Supabase Configuration
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      "",
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || "8000"),
    host: process.env.HOST || "localhost",
    environment: process.env.NODE_ENV || "development",
  },

  // API Configuration
  api: {
    baseUrl:
      process.env.API_BASE_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://api.satnam.pub"
        : "http://localhost:8000"),
  },

  // Privacy & Security Configuration
  privacy: {
    masterKey:
      process.env.PRIVACY_MASTER_KEY ||
      "dev-master-key-change-in-production-please-use-strong-random-key",
    jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
    saltRounds: parseInt(process.env.SALT_ROUNDS || "12"),
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || "",
  },

  // Nostr Configuration
  nostr: {
    relays: (
      process.env.NOSTR_RELAYS || "wss://relay.damus.io,wss://nos.lol"
    ).split(","),
    privateKey: process.env.NOSTR_PRIVATE_KEY || "",
    defaultPrivateKey: process.env.NOSTR_PRIVATE_KEY || "",
  },

  // Authentication Configuration
  auth: {
    tokenStorageKey: "satnam_auth_token",
    jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    nostrAuthKind: 27235, // Custom event kind for authentication
    nostrAuthChallenge:
      process.env.NOSTR_AUTH_CHALLENGE || "satnam-auth-challenge",
  },

  // Feature Flags
  features: {
    shamirSecretSharing: process.env.ENABLE_SSS !== "false", // Default enabled
    privacyMode: process.env.ENABLE_PRIVACY_MODE !== "false", // Default enabled
    federatedSigning: process.env.ENABLE_FEDERATED_SIGNING !== "false", // Default enabled
    guardianNotifications:
      process.env.ENABLE_GUARDIAN_NOTIFICATIONS !== "false", // Default enabled
  },

  // Development flags
  development: {
    enableDebugLogging: process.env.DEBUG_LOGGING === "true",
    enableSqlLogging: process.env.SQL_LOGGING === "true",
    enablePrivacyAudit: process.env.PRIVACY_AUDIT !== "false", // Default enabled
  },
};

// Validation function to check required configuration
export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = [];
  const missing: string[] = [];

  // Check critical configuration
  if (!config.supabase.url) {
    missing.push("SUPABASE_URL");
  }
  if (!config.supabase.serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (config.server.environment === "production") {
    if (config.privacy.masterKey.includes("dev-master-key")) {
      missing.push("PRIVACY_MASTER_KEY (using dev key in production)");
    }
    if (config.privacy.jwtSecret.includes("dev-jwt-secret")) {
      missing.push("JWT_SECRET (using dev secret in production)");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

// Export individual sections for convenience
export const db = config.database;
export const supabase = config.supabase;
export const server = config.server;
export const api = config.api;
export const authConfig = config.auth;
export const privacy = config.privacy;
export const redis = config.redis;
export const nostr = config.nostr;
export const features = config.features;
export const dev = config.development;

export default config;
