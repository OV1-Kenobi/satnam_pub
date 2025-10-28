/**
 * Secure JWT Validation Utility
 * Provides centralized JWT validation across all Netlify Functions
 *
 * Features:
 * - Structure validation (3-part check)
 * - Signature verification using HS256
 * - Expiry validation with 5-minute buffer for clock skew
 * - Issuer and audience validation
 * - Type-safe return values
 * - Comprehensive error handling
 *
 * JWT Format: header.payload.signature
 * - Header: Base64URL encoded JSON with algorithm and type
 * - Payload: Base64URL encoded JSON with claims
 * - Signature: HMAC-SHA256 of header.payload
 */

import { createHmac } from "node:crypto";
import { getEnvVar } from "./env.js";

/**
 * JWT payload structure
 */
export interface JWTPayload {
  [key: string]: unknown;
  iat?: number; // Issued at
  exp?: number; // Expiration time
  iss?: string; // Issuer
  aud?: string; // Audience
  sub?: string; // Subject
  jti?: string; // JWT ID
}

/**
 * JWT validation options
 */
export interface JWTValidationOptions {
  /** Expected issuer (e.g., "satnam.pub") */
  issuer?: string;
  /** Expected audience (e.g., "satnam.pub-users") */
  audience?: string;
  /** Clock tolerance in seconds (default: 300 = 5 minutes) */
  clockTolerance?: number;
  /** Require expiration claim (default: true) */
  requireExp?: boolean;
}

/**
 * JWT validation result
 */
export interface JWTValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * Decode Base64URL string
 * Handles padding and character replacement
 *
 * @param str - Base64URL encoded string
 * @returns Decoded string
 */
function decodeBase64URL(str: string): string {
  // Add padding if needed
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);

  // Replace URL-safe characters
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  // Decode
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Verify JWT signature using HMAC-SHA256
 *
 * @param token - JWT token
 * @param secret - Secret key for verification
 * @returns true if signature is valid
 */
function verifySignature(token: string, secret: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }

    const [header, payload, signature] = parts;
    const message = `${header}.${payload}`;

    // Create HMAC-SHA256 signature
    const hmac = createHmac("sha256", secret);
    hmac.update(message);
    const expectedSignature = hmac
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Constant-time comparison to prevent timing attacks
    return constantTimeCompare(signature, expectedSignature);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Constant-time string comparison
 * Prevents timing attacks by comparing all characters
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Validate JWT token
 * Performs comprehensive validation including structure, signature, and claims
 *
 * @param token - JWT token to validate
 * @param secret - Secret key for signature verification
 * @param options - Validation options
 * @returns Validation result with payload if valid
 */
export function validateJWT(
  token: string,
  secret: string,
  options: JWTValidationOptions = {}
): JWTValidationResult {
  try {
    // 1. Validate structure (3-part check)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        valid: false,
        error: "Invalid token structure",
      };
    }

    const [headerStr, payloadStr, signatureStr] = parts;

    // 2. Decode and parse header
    let header: { alg?: string; typ?: string };
    try {
      const headerJson = decodeBase64URL(headerStr);
      header = JSON.parse(headerJson);
    } catch (error) {
      return {
        valid: false,
        error: "Invalid header encoding",
      };
    }

    // Verify algorithm is HS256
    if (header.alg !== "HS256") {
      return {
        valid: false,
        error: "Invalid algorithm (expected HS256)",
      };
    }

    // 3. Decode and parse payload
    let payload: JWTPayload;
    try {
      const payloadJson = decodeBase64URL(payloadStr);
      payload = JSON.parse(payloadJson);
    } catch (error) {
      return {
        valid: false,
        error: "Invalid payload encoding",
      };
    }

    // 4. Verify signature
    if (!verifySignature(token, secret)) {
      return {
        valid: false,
        error: "Invalid signature",
      };
    }

    // 5. Validate expiration
    const now = Math.floor(Date.now() / 1000);
    const clockTolerance = options.clockTolerance ?? 300; // 5 minutes default

    if (options.requireExp !== false && !payload.exp) {
      return {
        valid: false,
        error: "Missing expiration claim",
      };
    }

    if (payload.exp && payload.exp < now - clockTolerance) {
      return {
        valid: false,
        error: "Token expired",
      };
    }

    // 6. Validate issuer
    if (options.issuer && payload.iss !== options.issuer) {
      return {
        valid: false,
        error: "Invalid issuer",
      };
    }

    // 7. Validate audience
    if (options.audience && payload.aud !== options.audience) {
      return {
        valid: false,
        error: "Invalid audience",
      };
    }

    return {
      valid: true,
      payload,
    };
  } catch (error) {
    console.error("JWT validation error:", error);
    return {
      valid: false,
      error: "Validation failed",
    };
  }
}

/**
 * Extract JWT token from Authorization header
 *
 * @param authHeader - Authorization header value
 * @returns JWT token or null if not found
 */
export function extractTokenFromHeader(
  authHeader: string | undefined
): string | null {
  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

/**
 * Validate JWT from Authorization header
 * Convenience function combining extraction and validation
 *
 * @param authHeader - Authorization header value
 * @param secret - Secret key for verification
 * @param options - Validation options
 * @returns Validation result
 */
export function validateJWTFromHeader(
  authHeader: string | undefined,
  secret: string,
  options: JWTValidationOptions = {}
): JWTValidationResult {
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return {
      valid: false,
      error: "Missing or invalid authorization header",
    };
  }

  return validateJWT(token, secret, options);
}

/**
 * Get JWT secret from environment
 * Uses DUID_SERVER_SECRET to derive JWT secret
 *
 * @returns JWT secret
 */
export function getJWTSecret(): string {
  const duidSecret = getEnvVar("DUID_SERVER_SECRET");
  if (!duidSecret) {
    throw new Error("DUID_SERVER_SECRET is required to derive JWT secret");
  }

  // Derive JWT secret using HMAC-SHA256
  const hmac = createHmac("sha256", duidSecret);
  hmac.update("jwt_secret|v1");
  return hmac.digest("hex");
}

/**
 * Validate JWT with automatic secret retrieval
 * Convenience function that gets the secret from environment
 *
 * @param token - JWT token to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateJWTWithEnvSecret(
  token: string,
  options: JWTValidationOptions = {}
): JWTValidationResult {
  try {
    const secret = getJWTSecret();
    return validateJWT(token, secret, options);
  } catch (error) {
    return {
      valid: false,
      error: "Failed to retrieve JWT secret",
    };
  }
}

/**
 * Validate JWT from Authorization header with automatic secret retrieval
 *
 * @param authHeader - Authorization header value
 * @param options - Validation options
 * @returns Validation result
 */
export function validateJWTFromHeaderWithEnvSecret(
  authHeader: string | undefined,
  options: JWTValidationOptions = {}
): JWTValidationResult {
  try {
    const secret = getJWTSecret();
    return validateJWTFromHeader(authHeader, secret, options);
  } catch (error) {
    return {
      valid: false,
      error: "Failed to retrieve JWT secret",
    };
  }
}

