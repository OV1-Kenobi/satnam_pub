/**
 * Configuration Entry Point
 *
 * This file exports all configuration settings for use throughout the application.
 */
import { randomBytes } from "crypto";
import * as dotenv from "dotenv";
import { z } from "zod";

// Load environment variables
dotenv.config();

// Validate critical environment variables
const envSchema = z.object({
  // core
  JWT_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),

  // api
  API_BASE_URL: z.string().url().optional(),

  // auth
  JWT_EXPIRES_IN: z.string().optional(),
  NOSTR_AUTH_CHALLENGE: z.string().optional(),

  // database
  DATABASE_SSL: z.coerce.boolean().optional(),

  // nostr
  NOSTR_RELAY_URL: z.string().url().optional(),
  NOSTR_PRIVATE_KEY: z.string().optional(),

  // lightning
  LIGHTNING_NODE_URL: z.string().url().optional(),
  LIGHTNING_MACAROON: z.string().optional(),
  LIGHTNING_CERT_PATH: z.string().optional(),

  // nip-05
  NIP05_DOMAIN: z.string().optional(),

  // family
  FAMILY_DOMAIN: z.string().optional(),
  FAMILY_USERNAME_MAX_LENGTH: z.coerce.number().int().positive().optional(),

  // server
  PORT: z.coerce.number().int().positive().optional(),

  // supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),

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

const envValidation = envSchema.safeParse(process.env);
if (!envValidation.success) {
  console.error("Environment validation failed:", envValidation.error.format());
  process.exit(1); // ensure container / PM2 restarts with correct env
}

/**
 * API configuration
 */
export const apiConfig = {
  baseUrl: process.env.API_BASE_URL || "https://api.satnam.pub",
  timeout: 30000, // 30 seconds
};

/**
 * Authentication configuration
 */
export const authConfig = {
  tokenStorageKey: "satnam_auth_token",
  jwtSecret:
    process.env.JWT_SECRET ||
    (() => {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "JWT_SECRET environment variable is required in production"
        );
      }
      // Generate a random secret for development environments only
      return randomBytes(32).toString("hex");
    })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  nostrAuthKind: 27235, // Custom event kind for authentication
  nostrAuthChallenge:
    process.env.NOSTR_AUTH_CHALLENGE ||
    "satnam_auth_" + Math.floor(Date.now() / 1000).toString(),
  otpExpiryMinutes: 10,
  maxOtpAttempts: 3,
};

/**
 * Database configuration
 */
export const dbConfig = {
  url: process.env.DATABASE_URL || "postgres://localhost:5432/identity_forge",
  ssl: process.env.DATABASE_SSL || false,
  // Parse DATABASE_URL into individual components for pg Pool
  ...(() => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return {
        host: "localhost",
        port: 5432,
        database: "identity_forge",
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
        database: parsed.pathname.slice(1), // Remove leading slash
        user: parsed.username,
        password: parsed.password,
        ssl:
          parsed.hostname.includes("supabase.co") ||
          process.env.DATABASE_SSL === "true",
      };
    } catch {
      console.warn("Failed to parse DATABASE_URL, using localhost defaults");
      return {
        host: "localhost",
        port: 5432,
        database: "identity_forge",
        user: "postgres",
        password: "",
        ssl: false,
      };
    }
  })(),
};

/**
 * Redis configuration
 */
export const redisConfig = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
};

/**
 * Nostr configuration
 */
export const nostrConfig = {
  relayUrl:
    process.env.NOSTR_RELAY_URL ||
    (() => {
      const defaultUrl = "wss://relay.damus.io";
      if (
        process.env.NODE_ENV === "production" &&
        !process.env.NOSTR_RELAY_URL
      ) {
        // Fall back to default relay URL in non-production environments
      }
      return defaultUrl;
    })(),
  privateKey: process.env.NOSTR_PRIVATE_KEY,
};

/**
 * Lightning configuration
 */
export const lightningConfig = {
  nodeUrl: process.env.LIGHTNING_NODE_URL,
  macaroon: process.env.LIGHTNING_MACAROON,
  certPath: process.env.LIGHTNING_CERT_PATH,
};

/**
 * NIP-05 configuration
 */
export const nip05Config = {
  domain: process.env.NIP05_DOMAIN || "yourdomain.com",
};

/**
 * Family member configuration
 */
export const familyConfig = {
  domain: process.env.FAMILY_DOMAIN || "satnam.pub",
  usernameMaxLength: process.env.FAMILY_USERNAME_MAX_LENGTH || 20,
};

/**
 * Server configuration
 */
export const serverConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
};

/**
 * Pubky configuration
 */
export const pubkyConfig = {
  homeserverUrl:
    process.env.PUBKY_HOMESERVER_URL || "https://homeserver.pubky.app",
  pkarrRelays: (
    process.env.PUBKY_PKARR_RELAYS ||
    "https://relay1.pubky.app,https://relay2.pubky.app"
  ).split(","),
  enableMigration: process.env.PUBKY_ENABLE_MIGRATION || false,
  sovereigntyTracking: process.env.PUBKY_SOVEREIGNTY_TRACKING || false,
};

/**
 * Pkarr configuration
 */
export const pkarrConfig = {
  relayTimeout: process.env.PKARR_RELAY_TIMEOUT || 5000,
  recordTtl: process.env.PKARR_RECORD_TTL || 3600,
  backupRelays: process.env.PKARR_BACKUP_RELAYS || 3,
  publishRetries: process.env.PKARR_PUBLISH_RETRIES || 3,
};

/**
 * Supabase configuration
 */
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
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

// Export a unified config object for convenience
export const config = {
  api: apiConfig,
  auth: authConfig,
  database: dbConfig,
  redis: redisConfig,
  nostr: nostrConfig,
  lightning: lightningConfig,
  nip05: nip05Config,
  family: familyConfig,
  server: serverConfig,
  pubky: pubkyConfig,
  pkarr: pkarrConfig,
  supabase: supabaseConfig,
  features: featureFlags,
};
