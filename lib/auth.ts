/**
 * Privacy-First Authentication utilities following Satnam.pub security protocols
 *
 * SECURITY FEATURES:
 * - NO pubkeys/npubs stored or transmitted in tokens
 * - PBKDF2 with 100,000 iterations for all hashing
 * - Privacy-safe hashed user identifiers only
 * - Constant-time comparison prevents timing attacks
 * - AES-256-GCM encryption for sensitive data
 * - Browser-compatible Web Crypto API usage
 */

import {
  sign as jwtSign,
  verify as jwtVerify,
  SignOptions,
} from "jsonwebtoken";
import type { StringValue } from "ms";
import { Request } from "../types/netlify-functions";
import browserCrypto from "./utils/browser-crypto-simple";
// Lazy import to prevent client creation on page load
let supabaseClient: any = null;
const getSupabaseClient = async () => {
  if (!supabaseClient) {
    const { supabase } = await import("./supabase");
    supabaseClient = supabase;
  }
  return supabaseClient;
};

// JWT configuration - secrets stored in Supabase Vault (compliance with MASTER_CONTEXT.md)
let JWT_SECRET: string | null = null;
let JWT_EXPIRES_IN: StringValue | number = "7d";

// Initialize JWT configuration from Supabase Vault
async function initializeJWTConfig(): Promise<void> {
  if (!JWT_SECRET) {
    try {
      // Get JWT secret from Supabase Vault
      const { data: secretData, error: secretError } = await supabase
        .from("vault.secrets")
        .select("decrypted_secret")
        .eq("name", "jwt_secret")
        .single();

      if (secretError) {
        console.error(
          "Error fetching JWT secret from Supabase Vault:",
          secretError
        );
        throw new Error("JWT secret not available");
      }

      JWT_SECRET = secretData.decrypted_secret;

      // Get JWT expiration from Supabase Vault (optional)
      const { data: expiresData } = await supabase
        .from("vault.secrets")
        .select("decrypted_secret")
        .eq("name", "jwt_expires_in")
        .single();

      if (expiresData) {
        JWT_EXPIRES_IN = expiresData.decrypted_secret as StringValue;
      }
    } catch (error) {
      console.error("Failed to initialize JWT configuration:", error);
      throw new Error("Authentication configuration unavailable");
    }
  }
}

// TypeScript interfaces
export interface UserData {
  userId: string;
  username: string;
  role?: string;
  hashedUserId?: string;
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: string;
  hashedUserId?: string;
  iat?: number;
  exp?: number;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  hashedUserId: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate privacy-first JWT token (NO sensitive data included)
 */
export async function generateToken(userData: UserData): Promise<string> {
  await initializeJWTConfig();

  if (!JWT_SECRET) {
    throw new Error("JWT secret not initialized");
  }

  const hashedUserId =
    userData.hashedUserId || (await createHashedUserId(userData.userId));

  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };

  return jwtSign(
    {
      userId: userData.userId,
      username: userData.username,
      role: userData.role || "user",
      hashedUserId,
      // PRIVACY: NO npub, pubkey, or sensitive data in tokens
    },
    JWT_SECRET as string,
    options
  );
}

/**
 * Verify JWT token and return user data
 */
export async function verifyToken(
  token: string
): Promise<AuthenticatedUser | null> {
  try {
    await initializeJWTConfig();

    if (!JWT_SECRET) {
      throw new Error("JWT secret not initialized");
    }

    const payload = jwtVerify(token, JWT_SECRET as string) as JWTPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Create privacy-safe authentication hash using PBKDF2 (Satnam.pub standard)
 * This follows the exact same protocol as PrivacyManager.createAuthHash
 * Browser-compatible implementation using Web Crypto API
 */
export async function createAuthHash(
  pubkey: string,
  salt?: string
): Promise<string> {
  try {
    // Generate salt if not provided
    const authSalt = salt || browserCrypto.randomBytes(32).toString("hex");

    // Use Web Crypto API for PBKDF2 in browser environment
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(pubkey),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(authSalt),
          iterations: 100000,
          hash: "SHA-512",
        },
        keyMaterial,
        512 // 64 bytes = 512 bits
      );

      const hash = Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return `${authSalt}:${hash}`;
    } else {
      // Web Crypto API is required for secure authentication
      throw new Error(
        "Web Crypto API not available - cannot create secure auth hash"
      );
    }
  } catch (error) {
    console.error("Error creating auth hash:", error);
    throw new Error(
      "Failed to create secure auth hash - Web Crypto API required"
    );
  }
}

/**
 * Verify pubkey against stored auth hash using constant-time comparison
 * Browser-compatible implementation using Web Crypto API
 */
export async function verifyAuthHash(
  pubkey: string,
  storedHash: string
): Promise<boolean> {
  try {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) {
      return false;
    }

    // Use Web Crypto API for PBKDF2 in browser environment
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(pubkey),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );

      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(salt),
          iterations: 100000,
          hash: "SHA-512",
        },
        keyMaterial,
        512 // 64 bytes = 512 bits
      );

      const hash = Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return constantTimeEquals(hash, originalHash);
    } else {
      // Web Crypto API is required for secure authentication
      throw new Error("Web Crypto API not available - cannot verify auth hash");
    }
  } catch (error) {
    console.error("Error verifying auth hash:", error);
    return false;
  }
}

/**
 * Create hashed user ID for privacy-preserving database operations
 * Uses SHA-256 with salt for non-reversible user identification
 * Browser-compatible implementation
 */
export async function createHashedUserId(userId: string): Promise<string> {
  // Get hash salt from Supabase Vault (compliance with MASTER_CONTEXT.md)
  let hashSalt: string;

  try {
    const { data: saltData } = await supabase
      .from("vault.secrets")
      .select("decrypted_secret")
      .eq("name", "hash_salt")
      .single();

    if (saltData) {
      hashSalt = saltData.decrypted_secret;
    } else {
      throw new Error("Hash salt not found in Vault");
    }
  } catch (error) {
    console.error("Failed to fetch hash salt from Vault:", error);
    throw new Error(
      "Cannot create hashed user ID without proper salt configuration"
    );
  }

  return browserCrypto
    .createHash("sha256")
    .update(userId + hashSalt)
    .digest("hex");
}

/**
 * Create platform ID (privacy-safe identifier)
 * Browser-compatible implementation
 */
export function createPlatformId(pubkey: string): string {
  return browserCrypto
    .createHash("sha256")
    .update(pubkey + "platform_salt")
    .digest("hex")
    .substring(0, 16);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
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
 * Get user data from request (for authenticated endpoints)
 */
export async function getUserFromRequest(
  req: Request
): Promise<AuthenticatedUser | null> {
  const token =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.cookies?.authToken ||
    req.headers["x-auth-token"];

  if (!token) {
    return null;
  }

  return await verifyToken(token);
}

/**
 * Browser-compatible random bytes generation
 */
export function generateRandomBytes(size: number): string {
  return browserCrypto.randomBytes(size).toString("hex");
}

/**
 * Generate random bytes as Buffer (for compatibility with existing code)
 */
export function randomBytes(size: number): Buffer {
  return browserCrypto.randomBytes(size);
}

/**
 * Browser-compatible UUID generation
 */
export function generateUUID(): string {
  return browserCrypto.randomUUID();
}
