/**
 * @fileoverview Configuration file for Satnam Recovery
 * @description Centralized configuration with environment variable fallbacks
 */

import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  // Database Configuration
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    name: process.env.DB_NAME || "satnam_recovery",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true",
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      "",
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || "3000"),
    host: process.env.HOST || "localhost",
    environment: process.env.NODE_ENV || "development",
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
    defaultPrivateKey: process.env.NOSTR_PRIVATE_KEY || "",
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
export const privacy = config.privacy;
export const redis = config.redis;
export const nostr = config.nostr;
export const features = config.features;
export const dev = config.development;

export default config;
