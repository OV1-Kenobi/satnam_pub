/**
 * Shared Authentication Cryptographic Utilities
 *
 * This module extracts common cryptographic functions used across
 * authentication endpoints to eliminate code duplication and ensure
 * consistent security practices.
 *
 * Features:
 * - Secure challenge generation with multiple entropy sources
 * - Session token generation with configurable length
 * - Environment-aware crypto implementation selection
 * - Fallback mechanisms for different runtime environments
 */

/**
 * Configuration for crypto utilities
 */
export const AUTH_CRYPTO_CONFIG = {
  CHALLENGE_LENGTH: 64, // 32 bytes as hex
  SESSION_TOKEN_LENGTH: 48, // 48 bytes for session tokens
  ALLOWED_ORIGINS: [
    "https://satnam.pub",
    "https://www.satnam.pub",
    "https://app.satnam.pub",
    "http://localhost:3002",
    "http://localhost:5173",
    "https://localhost:3002",
  ],
  RATE_LIMIT: {
    CHALLENGE_MAX_REQUESTS: 30,
    AUTH_MAX_REQUESTS: 20,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/**
 * Generate a cryptographically secure challenge string
 *
 * Uses multiple entropy sources with fallback mechanisms:
 * 1. Node.js crypto.randomBytes (server-side)
 * 2. Web Crypto API (browsers and modern environments)
 * 3. Math.random fallback (should never be used in production)
 *
 * @param length - Length of the challenge in hex characters (default: 64)
 * @returns Hex-encoded secure challenge string
 */
export async function generateSecureChallenge(
  length: number = AUTH_CRYPTO_CONFIG.CHALLENGE_LENGTH
): Promise<string> {
  // Web Crypto API (browsers and modern environments)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(length / 2);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  // Fallback (should never be used in production)
  console.error(
    "SECURITY WARNING: Using Math.random fallback for challenge generation"
  );
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a secure session token
 *
 * Uses multiple entropy sources similar to generateSecureChallenge
 * but optimized for session token requirements.
 *
 * @param length - Length of the token in bytes (default: 48)
 * @returns Hex-encoded secure session token
 */
export async function generateSessionToken(
  length: number = AUTH_CRYPTO_CONFIG.SESSION_TOKEN_LENGTH
): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  // Fallback (should never be used in production)
  console.error(
    "SECURITY WARNING: Using Math.random fallback for session token"
  );
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length * 2; i++) {
    // * 2 for hex length
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Extract client IP address from various request headers
 *
 * Checks multiple common headers used by reverse proxies and CDNs
 * in order of preference for accuracy.
 *
 * @param headers - Request headers object
 * @returns Client IP address or "unknown" if not found
 */
export function getClientIP(
  headers: Record<string, string | string[] | undefined>
): string {
  // Netlify-specific header (most reliable)
  if (headers["x-nf-client-connection-ip"]) {
    return headers["x-nf-client-connection-ip"] as string;
  }

  // Standard forwarded header (can contain multiple IPs)
  if (headers["x-forwarded-for"]) {
    const forwardedFor = headers["x-forwarded-for"] as string;
    return forwardedFor.split(",")[0].trim();
  }

  // Alternative real IP header
  if (headers["x-real-ip"]) {
    return headers["x-real-ip"] as string;
  }

  // Fallback to other common headers
  if (headers["cf-connecting-ip"]) {
    // Cloudflare
    return headers["cf-connecting-ip"] as string;
  }

  if (headers["x-client-ip"]) {
    return headers["x-client-ip"] as string;
  }

  return "unknown";
}

/**
 * Rate limiting store for in-memory tracking
 * Used as fallback when database-backed rate limiting is unavailable.
 * Primary rate limiting uses checkRateLimitDB() with database persistence.
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting record interface
 */
export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime?: number;
  error?: string;
}

/**
 * Check rate limiting for an IP address (IN-MEMORY FALLBACK)
 *
 * This function serves as a fallback when database-backed rate limiting is unavailable.
 * Primary rate limiting should use checkRateLimitDB() for production reliability.
 *
 * @param ip - Client IP address
 * @param maxRequests - Maximum requests allowed (default: 30)
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @returns Rate limit check result
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = AUTH_CRYPTO_CONFIG.RATE_LIMIT.CHALLENGE_MAX_REQUESTS,
  windowMs: number = AUTH_CRYPTO_CONFIG.RATE_LIMIT.WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    // New window or expired
    const resetTime = now + windowMs;
    rateLimitStore.set(ip, {
      count: 1,
      resetTime,
    });
    return {
      allowed: true,
      remainingRequests: maxRequests - 1,
      resetTime,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remainingRequests: 0,
      resetTime: record.resetTime,
    };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(ip, record);

  return {
    allowed: true,
    remainingRequests: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Clean up expired rate limit entries from memory
 * Should be called periodically to prevent memory leaks when using in-memory fallback
 *
 * @param currentTime - Current timestamp (default: Date.now())
 */
export function cleanupRateLimitStore(currentTime: number = Date.now()): void {
  for (const [ip, record] of Array.from(rateLimitStore.entries())) {
    if (currentTime > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Hash data for privacy protection using Web Crypto API
 */
async function hashForPrivacy(data: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (error) {
    console.error("Error hashing data for privacy:", error);
    throw error;
  }
}

/**
 * Get Supabase URL from environment variables
 */
function getSupabaseUrl(): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_SUPABASE_URL;
  }
  return undefined;
}

/**
 * Get Supabase anonymous key from environment variables (server-safe)
 */
function getSupabaseAnonKey(): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env.VITE_SUPABASE_ANON_KEY;
  }
  return undefined;
}

/**
 * Production-ready database-backed rate limiting
 *
 * This function provides persistent, distributed rate limiting using Supabase database:
 * - Shared across all server instances
 * - Survives server restarts and cold starts
 * - No memory leaks or cleanup required
 * - Persistent across deployments
 * - Consistent enforcement across all instances
 *
 * @param ip - Client IP address (will be hashed for privacy)
 * @param maxRequests - Maximum requests allowed (default: 30)
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @returns Promise<RateLimitResult> Rate limit check result
 */
export async function checkRateLimitDB(
  ip: string,
  maxRequests: number = AUTH_CRYPTO_CONFIG.RATE_LIMIT.CHALLENGE_MAX_REQUESTS,
  windowMs: number = AUTH_CRYPTO_CONFIG.RATE_LIMIT.WINDOW_MS
): Promise<RateLimitResult> {
  try {
    // Hash IP address for privacy protection
    const ipHash = await hashForPrivacy(ip);

    // Dynamic import to avoid circular dependencies and reduce bundle size
    const { createClient } = await import("@supabase/supabase-js");

    // Get Supabase configuration (anon key only)
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseAnonKey();

    if (!supabaseUrl || !supabaseKey) {
      console.error(
        "⚠️  Supabase configuration missing for database rate limiting"
      );
      // Fallback to in-memory rate limiting
      return checkRateLimit(ip, maxRequests, windowMs);
    }

    // Create Supabase client (anon)
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call database function for rate limiting
    const { data, error } = await supabase.rpc("check_and_update_rate_limit", {
      user_hash: ipHash,
      rate_limit: maxRequests,
      window_ms: windowMs,
    });

    if (error) {
      console.error("Database rate limit check failed:", error);
      // Fallback to in-memory rate limiting on database error
      return checkRateLimit(ip, maxRequests, windowMs);
    }

    // Validate the response structure
    if (!data || typeof data !== "object") {
      console.error("Invalid response structure from rate limit function");
      return checkRateLimit(ip, maxRequests, windowMs);
    }

    const result = data as {
      allowed: boolean;
      current_count: number;
      rate_limit: number;
      reset_time: number;
      window_ms: number;
      error?: string;
    };

    // Validate required fields
    if (
      typeof result.allowed !== "boolean" ||
      typeof result.current_count !== "number" ||
      typeof result.rate_limit !== "number" ||
      typeof result.reset_time !== "number"
    ) {
      console.error("Invalid response data from rate limit function");
      return checkRateLimit(ip, maxRequests, windowMs);
    }

    if (result.error) {
      console.error("Database rate limit function error:", result.error);
      // Fallback to in-memory rate limiting on function error
      return checkRateLimit(ip, maxRequests, windowMs);
    }

    return {
      allowed: result.allowed,
      remainingRequests: Math.max(0, result.rate_limit - result.current_count),
      resetTime: result.reset_time,
    };
  } catch (error) {
    console.error("Critical error in database rate limiting:", error);
    // Fallback to in-memory rate limiting on any error
    return checkRateLimit(ip, maxRequests, windowMs);
  }
}

/**
 * Validate if an origin is allowed for CORS
 *
 * @param origin - The origin header value
 * @returns True if origin is allowed, false otherwise
 */
export function validateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  // Check if origin is in the allowed list
  if (AUTH_CRYPTO_CONFIG.ALLOWED_ORIGINS.includes(origin as any)) {
    return true;
  }

  // Allow Netlify preview URLs
  if (origin.includes("netlify.app")) {
    return true;
  }

  // Allow localhost for development
  if (origin.includes("localhost")) {
    return true;
  }

  return false;
}

/**
 * Validation functions for cryptographic data
 */
export const validators = {
  /**
   * Check if a string is valid hexadecimal
   */
  isValidHex(str: string): boolean {
    return str.length > 0 && /^[a-fA-F0-9]+$/.test(str) && str.length % 2 === 0;
  },

  /**
   * Check if a string is a valid Nostr public key (64 hex characters)
   */
  isValidPublicKey(pubkey: string): boolean {
    return (
      typeof pubkey === "string" &&
      pubkey.length === 64 &&
      validators.isValidHex(pubkey)
    );
  },

  /**
   * Check if a string is a valid Nostr signature (128 hex characters)
   */
  isValidSignature(sig: string): boolean {
    return (
      typeof sig === "string" && sig.length === 128 && this.isValidHex(sig)
    );
  },

  /**
   * Check if a timestamp is within acceptable range
   */
  isValidTimestamp(timestamp: number, maxAgeMinutes: number = 15): boolean {
    const now = Date.now() / 1000;
    const maxAge = maxAgeMinutes * 60;
    return timestamp > now - maxAge && timestamp < now + 300; // Allow 5 min future clock skew
  },
};

/**
 * Standard CORS headers configuration
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
} as const;

/**
 * Standard security headers configuration
 */
export const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'",
} as const;

/**
 * Get CORS headers with validated origin
 *
 * @param origin - Request origin
 * @param methods - Allowed methods (default: "POST, OPTIONS")
 * @param credentials - Allow credentials (default: false)
 * @returns CORS headers object
 */
export function getCorsHeaders(
  origin: string | undefined,
  methods: string = "POST, OPTIONS",
  credentials: boolean = false
): Record<string, string> {
  const corsAllowed = validateOrigin(origin);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Access-Control-Allow-Origin": corsAllowed && origin ? origin : "null",
  };

  if (credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

/**
 * Get complete security headers including CORS
 *
 * @param origin - Request origin
 * @param allowCredentials - Whether to allow credentials (default: false)
 * @returns Complete headers object
 */
export function getSecurityHeaders(
  origin: string | undefined,
  allowCredentials: boolean = false
): Record<string, string> {
  const corsHeaders = getCorsHeaders(origin);

  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    ...corsHeaders,
  };

  if (allowCredentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}
