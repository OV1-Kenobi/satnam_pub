/**
 * Configuration Entry Point
 *
 * This file exports all configuration settings for use throughout the application.
 */
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables
dotenv.config();

// Validate critical environment variables
const envSchema = z.object({
  JWT_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
});

const envValidation = envSchema.safeParse(process.env);
if (!envValidation.success && process.env.NODE_ENV === "production") {
  console.error("Environment validation failed:", envValidation.error.format());
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
          "JWT_SECRET environment variable is required in production",
        );
      }
      console.warn("No JWT_SECRET provided, using a random secret for development only");
      // Generate a random secret for development instead of using a hardcoded one
      const crypto = require('crypto');
      return crypto.randomBytes(32).toString('hex');
    })(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  nostrAuthKind: 27235, // Custom event kind for authentication
  nostrAuthChallenge: process.env.NOSTR_AUTH_CHALLENGE || "satnam_auth_" + Math.floor(Date.now() / 1000).toString(),
  otpExpiryMinutes: 10,
  maxOtpAttempts: 3,
};

/**
 * Database configuration
 */
export const dbConfig = {
  url: process.env.DATABASE_URL || "postgres://localhost:5432/identity_forge",
  ssl: process.env.DATABASE_SSL === "true",
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
        console.warn("NOSTR_RELAY_URL not set, using default:", defaultUrl);
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
 * Server configuration
 */
export const serverConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
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
  server: serverConfig,
  features: featureFlags,
};
