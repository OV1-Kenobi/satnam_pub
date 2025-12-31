/**
 * Identity Registration API Endpoint - Production Ready
 * POST /api/auth/register-identity - Register new user identity with sovereignty enforcement
 *
 * MASTER CONTEXT COMPLIANCE:
 * ✅ JavaScript API route per browser-only serverless architecture
 * ✅ JWT token-based authentication with PBKDF2 + SHA-512 hashing
 * ✅ Privacy-first architecture with zero-knowledge patterns
 * ✅ Individual Wallet Sovereignty principle enforcement
 * ✅ Standardized role hierarchy with proper legacy mappings
 * ✅ Vault-based credential management integration
 * ✅ Web Crypto API for browser compatibility
 * ✅ Production-ready error handling and security validations
 * ✅ Rate limiting and input validation
 * ✅ Real database operations with Supabase integration
 */

import type { Handler } from "@netlify/functions";
import * as crypto from "node:crypto";
import { promisify } from "node:util";
import { supabase, supabaseKeyType } from "../../netlify/functions/supabase.js";
import { resolvePlatformLightningDomainServer } from "./utils/domain.server.js";

// DIAGNOSTIC: Build signature to confirm deployed bundle version in logs
const REGISTER_IDENTITY_BUILD =
  "register-identity@2025-11-10_nip05-normalize-v2" as const;

// Import centralized security utilities
import {
  RATE_LIMITS,
  checkRateLimitStatus,
  createRateLimitIdentifier,
  getClientIP,
} from "./utils/enhanced-rate-limiter.js";
import {
  createRateLimitErrorResponse,
  createValidationErrorResponse,
  generateRequestId,
  logError,
} from "./utils/error-handler.js";
import {
  errorResponse,
  getSecurityHeaders,
  jsonResponse,
  preflightResponse,
} from "./utils/security-headers.js";

type RegisterIdentityAction =
  | "register"
  | "create_attestation"
  | "get_attestations"
  | "get_attestation";

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

async function enforceRateLimitForAction(
  action: RegisterIdentityAction,
  clientIP: string,
  requestId: string,
  requestOrigin: string | undefined,
  method: string,
  userId?: string
): Promise<boolean> {
  const configMap: Partial<Record<RegisterIdentityAction, RateLimitConfig>> = {
    register: RATE_LIMITS.AUTH_REGISTER,
    create_attestation: RATE_LIMITS.ATTESTATION_CREATE,
    get_attestations: RATE_LIMITS.ATTESTATION_READ,
    get_attestation: RATE_LIMITS.ATTESTATION_READ,
  };

  const config = configMap[action];
  if (!config) {
    return true;
  }

  const identifier = createRateLimitIdentifier(userId, clientIP);
  const status = await checkRateLimitStatus(identifier, config);

  if (!status.allowed) {
    logError(new Error("Rate limit exceeded"), {
      requestId,
      endpoint: "register-identity",
      action,
      userId,
      method,
      clientIP,
    });

    return false;
  }

  return true;
}

// ---- Type definitions for strict TypeScript mode ----
export type Role = "private" | "offspring" | "adult" | "steward" | "guardian";

export interface SpendingLimits {
  daily: number;
  weekly: number;
  requiresApproval: number;
}

export interface RegistrationData {
  username: string;
  password: string;
  npub: string;
  encryptedNsec: string;
  nip05?: string | null;
  lightningAddress?: string | null;
  role?: Role | string;
  displayName?: string | null;
  bio?: string | null;
  generateInviteToken?: boolean;
  invitationToken?: string | null;
  isImportedAccount?: boolean;
  detectedProfile?: unknown;
  deterministicUserId?: string | null;
  familyId?: string | null;
}

interface ValidationSuccess {
  success: true;
  data: RegistrationData;
}
interface ValidationFailure {
  success: false;
  errors: Array<{ field: string; message: string }>;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

export type JWTClaims = Record<string, unknown>;

interface CreateUserIdentitySuccess {
  success: true;
  data: { id: string } | null;
}
interface CreateUserIdentityFailure {
  success: false;
  error: string;
  details?: string;
  code?: string;
}

type CreateUserIdentityResult =
  | CreateUserIdentitySuccess
  | CreateUserIdentityFailure;

interface InvitationProcessed {
  creditsAwarded?: number;
  welcomeMessage?: string;
  personalMessage?: string;
}

interface ResponseData {
  success: true;
  message: string;
  user: {
    id: string;
    hashedId: string;
    username: string;
    nip05: string;
    lightningAddress: string;
    displayName: string;
    role: Role | string;
    is_active: boolean;
    spendingLimits: SpendingLimits;
    registeredAt: string;
  };
  session: { token: string; expiresAt: string };
  sessionToken: string;
  meta: { timestamp: string; environment: string };
  invitationProcessed?: InvitationProcessed;
  postAuthAction?: string;
  verification_id?: string; // FIX-1: UUID for SimpleProof/Iroh attestations during registration
  // Phase 2: Family federation auto-acceptance during registration
  federationJoined?: {
    federation_duid: string;
    role: string;
    federation_name?: string;
  };
  federationJoinPending?: boolean; // Set if auto-accept failed but registration succeeded
}
// -----------------------------------------------

// SECURE JWT CREATION FUNCTION (compatible with auth-unified verification)
async function createSecureJWT(payload: JWTClaims): Promise<string> {
  try {
    // Import jose library for secure JWT creation
    const { SignJWT } = await import("jose");

    // Configuration
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }
    const JWT_ISSUER = process.env.JWT_ISSUER || "satnam.pub";
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "satnam.pub";

    // Create secret key
    const secret = new TextEncoder().encode(JWT_SECRET);

    // Create JWT with proper claims
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime("24h") // 24 hours
      .sign(secret);

    console.log("✅ Secure JWT created successfully for registration");
    return jwt;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ JWT creation error:", msg);
    throw new Error(`JWT creation failed: ${msg}`);
  }
}

// REMOVED: Deprecated getEnvVar() function
// Now using direct process.env access as per new Vite-injected pattern

// Shared DUID secret utility to standardize secret handling
async function getDUIDSecret() {
  const secret = process.env.DUID_SERVER_SECRET || process.env.DUID_SECRET_KEY;
  if (!secret) {
    throw new Error("Server configuration error: DUID secret missing");
  }
  return secret;
}

/**
 * Publish PKARR record asynchronously (non-blocking)
 * Phase 2A Day 5: Server-side PKARR publishing after registration
 * @param npub - User's Nostr public key (npub format)
 * @param username - User's username
 * @param domain - Platform domain for NIP-05
 */
async function publishPkarrRecordAsync(
  npub: string,
  username: string,
  domain: string
): Promise<void> {
  try {
    // Import nip19 for npub decoding
    const { nip19 } = await import("nostr-tools");

    // Decode npub to hex public key
    const decoded = nip19.decode(npub);
    if (decoded.type !== "npub") {
      throw new Error("Invalid npub format");
    }
    // decoded.data for npub is already a hex string, not Uint8Array
    const publicKeyHex =
      typeof decoded.data === "string"
        ? decoded.data
        : Buffer.from(decoded.data as Uint8Array).toString("hex");

    // Create PKARR DNS records for NIP-05 verification
    const nip05Identifier = `${username}@${domain}`;
    const records = [
      {
        name: "_nostr",
        type: "TXT",
        value: `nostr=${npub}`,
        ttl: 3600,
      },
      {
        name: "_nip05",
        type: "TXT",
        value: nip05Identifier,
        ttl: 3600,
      },
    ];

    // Store in database (pkarr_records table)
    const recordsJson = JSON.stringify(records);
    const timestamp = Math.floor(Date.now() / 1000);
    const sequence = 1; // First publish

    // Insert into pkarr_records table
    const { error: insertError } = await supabase.from("pkarr_records").insert({
      public_key: publicKeyHex,
      records: recordsJson,
      timestamp,
      sequence,
      signature: "", // Server-side publishing doesn't require signature verification
      relay_urls: [], // Will be populated by scheduled republish job
      last_published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("❌ PKARR database insert failed:", insertError);
      throw new Error(`PKARR database insert failed: ${insertError.message}`);
    }

    console.log("✅ PKARR record stored in database for:", nip05Identifier);
  } catch (error) {
    console.error("❌ PKARR publishing error:", error);
    throw error;
  }
}

/**
 * SECURITY: Password hashing utilities with PBKDF2/SHA-512
 * Implements secure password storage with unique salts per user
 */

/**
 * Generate cryptographically secure salt for password hashing
 * @returns {string} Base64-encoded salt
 */
function generatePasswordSalt() {
  return crypto.randomBytes(24).toString("base64");
}

/**
 * Hash password using PBKDF2 with SHA-512
 * @param {string} password - Plain text password
 * @param {string} salt - Base64-encoded salt
 * @returns {Promise<string>} Hex-encoded password hash
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const iterations = 100000; // PBKDF2 iterations (minimum recommended)
  const keyLength = 64; // SHA-512 output length (bytes)
  const algorithm = "sha512";

  const pbkdf2 = promisify(crypto.pbkdf2);
  const hash = await pbkdf2(password, salt, iterations, keyLength, algorithm);
  return hash.toString("hex");
}

/**
 * Verify password against stored hash using timing-safe comparison
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored password hash
 * @param {string} salt - Password salt
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  try {
    const computedHash = await hashPassword(password, salt);

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch (error) {
    console.error("Password verification failed:", error);
    return false;
  }
}

// Deprecated OTP-based rate limiting constants retained for documentation only

/**
 * Validate role from Identity Forge component
 * @param {string} role - Role from Identity Forge
 * @returns {'private'|'offspring'|'adult'|'steward'|'guardian'} Validated role
 */
function validateRole(role: string): Role {
  const validRoles = ["private", "offspring", "adult", "steward", "guardian"];
  return validRoles.includes(role) ? (role as Role) : "private";
}

/**
 * Generate Individual Wallet Sovereignty spending limits based on role
 * MASTER CONTEXT COMPLIANCE: Private/Adults/Stewards/Guardians have unlimited authority (-1)
 * @param {'private'|'offspring'|'adult'|'steward'|'guardian'} role - Standardized role
 * @returns {Object} Spending limits configuration
 */
function generateSovereigntySpendingLimits(role: Role): SpendingLimits {
  switch (role) {
    case "private":
    case "adult":
    case "steward":
    case "guardian":
      return {
        daily: -1, // Unlimited sovereignty
        weekly: -1, // Unlimited sovereignty
        requiresApproval: -1, // No approval required
      };
    case "offspring":
      return {
        daily: 50000, // 50k sats daily limit
        weekly: 200000, // 200k sats weekly limit
        requiresApproval: 100000, // Requires approval above 100k sats
      };
    default:
      // Fallback to offspring limits for unknown roles
      return {
        daily: 50000,
        weekly: 200000,
        requiresApproval: 100000,
      };
  }
}

/**
 * Generate privacy-preserving user hash using Web Crypto API
 * @param {string} userData - User data to hash
 * @returns {Promise<string>} Privacy-preserving hash
 */
async function generatePrivacyPreservingHash(
  userData: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`registration_${userData}_${Date.now()}`);
  let subtle;
  try {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      subtle = globalThis.crypto.subtle;
    } else {
      const nodeCrypto = await import("node:crypto");
      subtle = nodeCrypto.webcrypto.subtle;
    }
  } catch (e) {
    const nodeCryptoFallback = await import("node:crypto");
    subtle = nodeCryptoFallback.webcrypto.subtle;
  }
  const hashBuffer = await subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Extract client information for security logging
 * @param {Object} event - Netlify Functions event object
 * @returns {Object} Client information
 */
function extractClientInfo(event: { headers: Record<string, any> }): {
  userAgent: any;
  ipAddress: any;
} {
  return {
    userAgent: event.headers["user-agent"],
    ipAddress:
      event.headers["x-forwarded-for"] ||
      event.headers["x-real-ip"] ||
      event.headers["client-ip"],
  };
}

/**
 * Validate registration request data
 * @param {Object} userData - User registration data
 * @returns {Object} Validation result
 */
function validateRegistrationData(
  userData: Record<string, any>
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!userData || typeof userData !== "object") {
    errors.push({ field: "body", message: "Request body must be an object" });
    return { success: false, errors };
  }

  // Required fields validation
  if (
    !userData.username ||
    typeof userData.username !== "string" ||
    userData.username.trim().length < 3
  ) {
    errors.push({
      field: "username",
      message: "Username must be at least 3 characters long",
    });
  }

  if (
    !userData.password ||
    typeof userData.password !== "string" ||
    userData.password.length < 8
  ) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters long",
    });
  }

  if (userData.password !== userData.confirmPassword) {
    errors.push({
      field: "confirmPassword",
      message: "Passwords do not match",
    });
  }

  // Validate npub (new format from Identity Forge)
  if (
    !userData.npub ||
    typeof userData.npub !== "string" ||
    !userData.npub.startsWith("npub1")
  ) {
    errors.push({ field: "npub", message: "Valid npub is required" });
  }

  // Validate nsec (should be present for both generated and imported accounts)
  // Note: Now expecting raw nsec, server will handle Noble V2 encryption
  if (!userData.encryptedNsec || typeof userData.encryptedNsec !== "string") {
    errors.push({ field: "encryptedNsec", message: "Private key is required" });
  }

  // Validate nsec format (should start with nsec1)
  if (userData.encryptedNsec && !userData.encryptedNsec.startsWith("nsec1")) {
    errors.push({
      field: "encryptedNsec",
      message: "Invalid private key format - must be bech32 nsec",
    });
  }

  // Username format validation
  if (userData.username && !/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
    errors.push({
      field: "username",
      message:
        "Username can only contain letters, numbers, underscores, and hyphens",
    });
  }

  // NIP-05 validation - must match username@{resolved_domain}
  // Domain is resolved dynamically from VITE_PLATFORM_LIGHTNING_DOMAIN or PLATFORM_LIGHTNING_DOMAIN env vars
  // Falls back to 'my.satnam.pub' if no env var is set
  const resolvedDomain = resolvePlatformLightningDomainServer();

  if (userData.nip05) {
    // FIX #5: Validate NIP-05 length before database write
    // NIP-05 identifiers should not exceed 255 characters (typical database VARCHAR limit)
    if (userData.nip05.length > 255) {
      errors.push({
        field: "nip05",
        message: "NIP-05 identifier exceeds maximum length of 255 characters",
      });
    }

    // FIX #5: Validate NIP-05 format (must contain exactly one '@' symbol)
    const atSymbolCount = (userData.nip05.match(/@/g) || []).length;
    if (atSymbolCount !== 1) {
      errors.push({
        field: "nip05",
        message:
          "NIP-05 identifier must contain exactly one '@' symbol (format: username@domain)",
      });
    }

    // Normalize both sides for comparison: lowercase and trim whitespace
    // NIP-05 identifiers are case-insensitive per spec
    const normalizedReceivedNip05 = userData.nip05.trim().toLowerCase();
    const normalizedExpectedNip05 = `${userData.username
      .trim()
      .toLowerCase()}@${resolvedDomain}`;

    // DIAGNOSTIC: Log NIP-05 validation details for debugging
    console.log("🔍 NIP-05 Validation Debug:", {
      receivedNip05: userData.nip05,
      normalizedReceivedNip05,
      receivedUsername: userData.username,
      resolvedDomain,
      normalizedExpectedNip05,
      match: normalizedReceivedNip05 === normalizedExpectedNip05,
    });

    if (normalizedReceivedNip05 !== normalizedExpectedNip05) {
      errors.push({
        field: "nip05",
        message: `NIP-05 must match username@${resolvedDomain} format`,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      username: userData.username.trim().toLowerCase(),
      password: userData.password,
      npub: userData.npub.trim(),
      encryptedNsec: userData.encryptedNsec,
      nip05:
        userData.nip05 ||
        `${userData.username
          .trim()
          .toLowerCase()}@${resolvePlatformLightningDomainServer()}`,
      lightningAddress: userData.lightningAddress,
      role: userData.role || "private",
      displayName: userData.displayName?.trim(),
      bio: userData.bio?.trim(),
      generateInviteToken: userData.generateInviteToken || false,
      invitationToken: userData.invitationToken || null,
      // Support for imported accounts
      isImportedAccount: userData.isImportedAccount || false,
      detectedProfile: userData.detectedProfile || null,
      // DUID Integration: Include pre-generated DUID from Identity Forge
      deterministicUserId: userData.deterministicUserId || null,
    },
  };
}

/**
 * Check rate limiting for registration attempts
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<Object>} Rate limit check result
 */

/**
 * Check username availability using secure DUID architecture
 * Uses direct database lookup with proper NIP-05 format validation
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if available
 */
async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    const domain = resolvePlatformLightningDomainServer();
    const local = (username || "").trim().toLowerCase();
    if (!local) return false;

    // Server-side DUID hashing for availability check (no plaintext lookup)
    const crypto = await import("node:crypto");
    const secret = await getDUIDSecret();
    const identifier = `${local}@${domain}`;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(identifier);
    const user_duid = hmac.digest("hex");

    const { data, error } = await supabase
      .from("nip05_records")
      .select("id")
      .eq("domain", domain)
      .eq("user_duid", user_duid)
      .eq("is_active", true)
      .limit(1);

    if (error) {
      // DUID-only architecture: treat schema errors (e.g. 42703) as misconfiguration, no plaintext fallback
      if ((error as any).code === "42703") {
        console.error(
          "Privacy-first nip05_records schema is misconfigured (missing DUID columns):",
          error
        );
      } else {
        console.error("Username availability check failed:", error);
      }
      return false; // Conservative: assume not available on error
    }

    let isAvailable = !data || data.length === 0;

    // DIAGNOSTIC: Log availability check result for debugging
    console.log(
      `[USERNAME_AVAILABILITY] nip05_records check for "${local}@${domain}":`,
      {
        hasData: !!data,
        dataLength: data?.length ?? 0,
        isAvailable,
        user_duid_prefix: user_duid.substring(0, 10) + "...",
        queryDomain: domain,
      }
    );

    // Check against federation_lightning_config to prevent user/federation namespace collisions
    // Federations use the same handle@my.satnam.pub namespace as individual users
    // NOTE: This check may fail silently if anon role lacks SELECT on federation_lightning_config
    // In that case, RLS returns empty array (not error), so we proceed safely
    if (isAvailable) {
      try {
        const { data: federations, error: fedErr } = await supabase
          .from("federation_lightning_config")
          .select("federation_duid")
          .eq("federation_handle", local)
          .limit(1);

        console.log(
          `[USERNAME_AVAILABILITY] federation_lightning_config check for "${local}":`,
          {
            hasError: !!fedErr,
            errorCode: (fedErr as any)?.code,
            hasData: !!federations,
            dataLength: federations?.length ?? 0,
          }
        );

        if (!fedErr && federations && federations.length > 0) {
          isAvailable = false;
          console.log(
            `[USERNAME_AVAILABILITY] Handle "${local}" is already taken by a federation`
          );
        }
      } catch (fedCheckErr) {
        console.warn(
          "Federation handle cross-check failed; relying on nip05_records only:",
          fedCheckErr
        );
      }
    }

    // Final result logging
    console.log(
      `[USERNAME_AVAILABILITY] Final result for "${local}@${domain}":`,
      {
        isAvailable,
        timestamp: new Date().toISOString(),
      }
    );

    return isAvailable;
  } catch (error) {
    console.error("Username availability check error:", error);
    return false; // Conservative: assume not available on error
  }
}

/**
 * Create user identity in database with maximum encryption and DUID
 * MAXIMUM ENCRYPTION: Stores all sensitive data in hashed columns only
 * DETERMINISTIC USER ID: Uses DUID for O(1) authentication performance
 * @param {Object} userData - Validated user data
 * @param {Object} spendingLimits - Sovereignty spending limits
 * @returns {Promise<Object>} Database operation result
 */
async function createUserIdentity(
  userData: RegistrationData & { role: Role | string },
  spendingLimits: SpendingLimits
): Promise<CreateUserIdentityResult> {
  // CORS headers for error responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  try {
    console.log("🔍 createUserIdentity: Starting user creation process:", {
      username: userData.username,
      role: userData.role,
      hasNpub: !!userData.npub,
      hasEncryptedNsec: !!userData.encryptedNsec,
      hasPassword: !!userData.password,
    });

    // CRITICAL SECURITY: Import privacy-first hashing utilities
    console.log("🔍 Importing privacy-hashing utilities...");
    const { generateUserSalt } = await import(
      "../../lib/security/privacy-hashing.js"
    );
    console.log("✅ Privacy-hashing utilities imported successfully");

    // DUID Generation: Use canonical NIP-05-based DUID generation
    let deterministicUserId;

    try {
      // Import canonical DUID generator
      const { generateDUIDFromNIP05 } = await import(
        "../../lib/security/duid-generator.js"
      );

      // Generate DUID from NIP-05 identifier (consistent with username availability check)
      const nip05Identifier =
        userData.nip05 ||
        `${userData.username}@${resolvePlatformLightningDomainServer()}`;
      deterministicUserId = await generateDUIDFromNIP05(nip05Identifier);

      console.log("✅ Canonical NIP-05-based DUID generated:", {
        nip05: nip05Identifier,
        duidPrefix: deterministicUserId.substring(0, 10) + "...",
        timestamp: new Date().toISOString(),
        source: "canonical-nip05",
      });
    } catch (duidError) {
      console.error("❌ Canonical DUID generation failed:", duidError);
      return {
        success: false,
        error: "DUID generation failed",
        details: "Failed to generate deterministic user ID. Please try again.",
        code: "DUID_GENERATION_FAILED",
      };
    }

    // Generate unique user salt for maximum encryption (still needed for sensitive data)
    const userSalt = await generateUserSalt();

    // SERVER-SIDE ENCRYPTION: Encrypt nsec using Noble V2 (ACTIVE)
    console.log("🔐 Encrypting nsec with Noble V2 (server-side)");
    let encryptedNsecNoble: string;
    try {
      const { encryptNsecSimple } = await import(
        "../functions/security/noble-encryption.js"
      );
      encryptedNsecNoble = await encryptNsecSimple(
        userData.encryptedNsec,
        userSalt
      );
      console.log("✅ Noble V2 nsec encryption successful");
    } catch (encryptError) {
      const msg =
        encryptError instanceof Error
          ? encryptError.message
          : String(encryptError);
      console.error("❌ Noble V2 nsec encryption failed:", msg);
      throw new Error("Failed to encrypt nsec securely: " + msg);
    }

    // Generate secure password salt and hash
    const passwordSalt = generatePasswordSalt();
    const passwordHash = await hashPassword(userData.password, passwordSalt);

    // ENCRYPTION HELPER: Encrypt profile fields using Noble V2
    async function encryptProfileField(
      value: string | null,
      salt: string
    ): Promise<{ cipher: string; iv: string; tag: string } | null> {
      if (!value) return null;
      try {
        const { encryptField } = await import(
          "../functions/security/noble-encryption.js"
        );
        return await encryptField(value, salt);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Profile field encryption failed:", msg);
        throw new Error("Failed to encrypt profile field: " + msg);
      }
    }

    // ENCRYPT PROFILE FIELDS: Use Noble V2 encryption for displayable data
    let encryptedUsername: { cipher: string; iv: string; tag: string } | null;
    let encryptedBio: { cipher: string; iv: string; tag: string } | null;
    let encryptedDisplayName: {
      cipher: string;
      iv: string;
      tag: string;
    } | null;
    let encryptedNip05: { cipher: string; iv: string; tag: string } | null;
    let encryptedLightningAddress: {
      cipher: string;
      iv: string;
      tag: string;
    } | null;
    let encryptedNpub: { cipher: string; iv: string; tag: string } | null;

    try {
      // Encrypt displayable profile fields
      console.log("🔐 Encrypting profile fields with Noble V2...");
      encryptedUsername = await encryptProfileField(
        userData.username,
        userSalt
      );
      encryptedBio = await encryptProfileField(userData.bio || null, userSalt);
      encryptedDisplayName = await encryptProfileField(
        userData.displayName || null,
        userSalt
      );
      encryptedNip05 = await encryptProfileField(
        userData.nip05 || null,
        userSalt
      );
      encryptedLightningAddress = await encryptProfileField(
        userData.lightningAddress || null,
        userSalt
      );
      // PRIVACY-FIRST: Encrypt npub for secure storage; decrypt only during signin for JWT
      encryptedNpub = await encryptProfileField(userData.npub, userSalt);
      console.log("✅ Profile fields encrypted successfully (including npub)");

      // Greenfield rollout: no hashed auth fields required (use DUID records)
      console.log(
        "🔐 Skipping legacy hashed auth fields; using DUID records instead"
      );
    } catch (encryptError) {
      console.error("Failed to encrypt/hash user data:", encryptError);
      throw new Error("Failed to encrypt user data securely");
    }

    // Create profile data with DUID as primary key for O(1) authentication lookups
    const profileData = {
      id: deterministicUserId, // Use DUID as primary key for O(1) database lookups
      user_salt: userSalt, // Store user salt for future hashing operations

      // DECRYPTABLE NSEC: Store Noble V2 encrypted nsec for authentication flow
      encrypted_nsec: encryptedNsecNoble, // noble-v2.<salt>.<iv>.<cipher>

      // ENCRYPTED PROFILE COLUMNS: Displayable user data encrypted with Noble V2
      encrypted_username: encryptedUsername?.cipher || null,
      encrypted_username_iv: encryptedUsername?.iv || null,
      encrypted_username_tag: encryptedUsername?.tag || null,

      encrypted_bio: encryptedBio?.cipher || null,
      encrypted_bio_iv: encryptedBio?.iv || null,
      encrypted_bio_tag: encryptedBio?.tag || null,

      encrypted_display_name: encryptedDisplayName?.cipher || null,
      encrypted_display_name_iv: encryptedDisplayName?.iv || null,
      encrypted_display_name_tag: encryptedDisplayName?.tag || null,

      encrypted_nip05: encryptedNip05?.cipher || null,
      encrypted_nip05_iv: encryptedNip05?.iv || null,
      encrypted_nip05_tag: encryptedNip05?.tag || null,

      encrypted_lightning_address: encryptedLightningAddress?.cipher || null,
      encrypted_lightning_address_iv: encryptedLightningAddress?.iv || null,
      encrypted_lightning_address_tag: encryptedLightningAddress?.tag || null,

      // Metadata (non-sensitive)
      role: userData.role,
      spending_limits: spendingLimits,
      privacy_settings: {
        privacy_level: "maximum", // Maximum privacy with encrypted storage
        zero_knowledge_enabled: true,
        over_encryption: true, // Flag indicating encrypted storage
        is_imported_account: userData.isImportedAccount || false,
        detected_profile_data: userData.detectedProfile || null,
      },

      // ENCRYPTED NPUB: Privacy-first storage; decrypted only during signin for JWT session
      encrypted_npub: encryptedNpub?.cipher || null,
      encrypted_npub_iv: encryptedNpub?.iv || null,
      encrypted_npub_tag: encryptedNpub?.tag || null,

      // Secure password storage
      password_hash: passwordHash,
      password_salt: passwordSalt,
      password_created_at: new Date().toISOString(),
      password_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      requires_password_change: false,
      is_active: true, // New users are active by default
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insert into user_identities table with error handling for missing columns
    console.log(
      "🔄 Attempting to insert user identity with encrypted profile columns...",
      {
        keyType: "anon_preferred",
        supabaseKeyTypeHint:
          typeof supabaseKeyType === "undefined"
            ? "unknown"
            : typeof supabaseKeyType === "string"
            ? supabaseKeyType
            : "unknown",
        profileDataKeys: Object.keys(profileData),
        hasId: !!profileData.id,
        hasEncryptedUsername: !!profileData.encrypted_username,
        hasEncryptedNsec: !!profileData.encrypted_nsec,
      }
    );

    // DIAGNOSTIC: Test Supabase connection before insert
    try {
      const { error: testError } = await supabase
        .from("user_identities")
        .select("id", { head: true })
        .limit(1);
      if (testError) {
        console.error("❌ Supabase connection test failed:", testError);
        return {
          success: false,
          error: "Database connection failed",
          details: testError.message,
        };
      }
      console.log("✅ Supabase connection test passed");
    } catch (connectionError) {
      console.error("❌ Supabase connection error:", connectionError);
      return {
        success: false,
        error: "Database connection error",
        details:
          connectionError instanceof Error
            ? connectionError.message
            : "Unknown error",
      };
    }

    // IMPORTANT: Using anon key requires RLS policies to allow this insert for unauthenticated (anon) role.
    // Ensure database has proper RLS for public registration or switch to an authenticated flow.
    console.log("🔄 Executing database insert...");

    // Set per-request RLS context for INSERT by DUID (safe fallback if helper missing)
    try {
      await supabase.rpc("app_set_config", {
        setting_name: "app.registration_duid",
        setting_value: profileData.id,
        is_local: true,
      });
    } catch (e) {
      try {
        await supabase.rpc("set_app_config", {
          setting_name: "app.registration_duid",
          setting_value: profileData.id,
          is_local: true,
        });
      } catch {}
    }

    const { error } = await supabase
      .from("user_identities")
      .insert([profileData]);

    // Since we provided a deterministic DUID as id, we can return it without selecting
    const data = error ? null : { id: profileData.id };

    if (error) {
      console.error("User identity creation failed:", error);
      console.error("Database error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      console.error(
        "User identity creation failed - data summary (redacted):",
        {
          hasId: !!profileData.id,
          role: profileData.role,
          hasEncryptedNsec: !!profileData.encrypted_nsec,
          fieldCount: Object.keys(profileData).length,
        }
      );
      return {
        success: false,
        error: "Failed to create user identity",
        details: error.message,
        code: error.code,
      };
    }

    // REMOVED: profiles table insertion (table does not exist)
    // The user_identities table is the single source of truth for user data
    // Maximum encryption architecture enforced through hashed columns only

    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("User profile creation error:", msg);
    return { success: false, error: "Database operation failed" };
  }
}

/**
 * Identity Registration API Handler - Production Ready
 * @param {Object} event - Netlify Functions event object
 * @param {Object} context - Netlify Functions context object
 * @returns {Promise<Object>} Netlify Functions response object
 */
export const handler: Handler = async (event, context) => {
  // Generate request ID for tracking and client IP for rate limiting
  const requestId = generateRequestId();
  const clientIP = getClientIP(
    (event.headers || {}) as Record<string, string | string[]>
  );

  console.log("🚀 Registration handler started:", {
    requestId,
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString(),
  });

  // DIAGNOSTIC: Build signature to confirm deployed bundle
  console.log("🧩 Build:", { build: REGISTER_IDENTITY_BUILD });

  // DIAGNOSTIC: Test environment variables and Supabase connection
  console.log("🔍 Environment check:", {
    hasSupabaseUrl:
      !!process.env.SUPABASE_URL || !!process.env.VITE_SUPABASE_URL,
    hasSupabaseKey:
      !!process.env.SUPABASE_ANON_KEY || !!process.env.VITE_SUPABASE_ANON_KEY,
    hasDuidSecret: !!process.env.DUID_SERVER_SECRET,
    supabaseKeyType: supabaseKeyType,
    nodeEnv: process.env.NODE_ENV,
  });

  // DIAGNOSTIC: Domain resolution variables and computed domain
  console.log("🌐 Domain resolution check:", {
    VITE_PLATFORM_LIGHTNING_DOMAIN: process.env.VITE_PLATFORM_LIGHTNING_DOMAIN,
    PLATFORM_LIGHTNING_DOMAIN: process.env.PLATFORM_LIGHTNING_DOMAIN,
    resolvedDomain: resolvePlatformLightningDomainServer(),
  });

  // Use centralized security headers utility for CORS and security headers
  function buildSecurityHeaders(origin: string | undefined) {
    return getSecurityHeaders(origin, {
      cspPolicy: "default-src 'none'; frame-ancestors 'none'",
    });
  }
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = buildSecurityHeaders(requestOrigin);
  corsHeaders["Content-Type"] = "application/json";

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse(requestOrigin);
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed", requestOrigin);
  }

  // Track reserved NIP-05 reservation for cleanup across try/catch scope
  let reservedUserDuid: string | null = null;
  let reservedDomain: string | null = null;

  // Shared helper to extract and verify JWT and return userId
  async function getUserIdFromAuthHeader(
    event: any,
    requestOrigin: string | undefined
  ): Promise<
    { success: true; userId: string } | { success: false; response: any }
  > {
    const headers = (event.headers || {}) as Record<string, string | string[]>;
    const authHeader =
      (headers["authorization"] as string) ||
      (headers["Authorization"] as string);

    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return {
        success: false,
        response: errorResponse(
          401,
          "Missing or invalid authorization header",
          requestOrigin
        ),
      };
    }

    const token = authHeader.slice(7).trim();

    const { jwtVerify } = await import("jose");
    const JWT_SECRET = process.env.JWT_SECRET;
    const JWT_ISSUER = process.env.JWT_ISSUER || "satnam.pub";
    const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "satnam.pub";

    if (!JWT_SECRET) {
      console.error("JWT_SECRET is not configured for attestation operations");
      return {
        success: false,
        response: errorResponse(
          500,
          "Server configuration error",
          requestOrigin
        ),
      };
    }

    let payload: any;
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const result = await jwtVerify(token, secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: 30,
      });
      payload = result.payload;
    } catch (err) {
      console.error("JWT verification failed for attestation operation", err);
      return {
        success: false,
        response: errorResponse(401, "Invalid or expired token", requestOrigin),
      };
    }

    const userId = payload?.userId as string | undefined;
    if (!userId) {
      return {
        success: false,
        response: errorResponse(401, "Invalid token payload", requestOrigin),
      };
    }

    return { success: true, userId };
  }

  // Shared helper to load and verify ownership of a verification record
  async function getOwnedVerificationRecord(
    verificationId: string,
    userId: string,
    requestOrigin: string | undefined,
    contextLabel: string
  ): Promise<
    | { success: true; verificationId: string }
    | { success: false; response: any }
  > {
    const { supabaseAdmin } = await import(
      "../../netlify/functions/supabase.js"
    );
    if (!supabaseAdmin) {
      console.error(
        "supabaseAdmin is not configured for attestation verification checks"
      );
      return {
        success: false,
        response: errorResponse(
          500,
          "Server configuration error",
          requestOrigin
        ),
      };
    }

    const { data: verificationRow, error: verificationError } =
      await supabaseAdmin
        .from("multi_method_verification_results")
        .select("id, user_duid")
        .eq("id", verificationId)
        .single();

    if (verificationError || !verificationRow) {
      console.error(
        `Failed to load verification record for ${contextLabel}`,
        verificationError
      );
      return {
        success: false,
        response: errorResponse(
          404,
          "Verification record not found",
          requestOrigin
        ),
      };
    }

    if (verificationRow.user_duid !== userId) {
      console.warn(`${contextLabel} ownership mismatch`, {
        tokenUserId: userId,
        verificationUserDuid: verificationRow.user_duid,
      });
      return {
        success: false,
        response: errorResponse(403, "Forbidden", requestOrigin),
      };
    }

    return { success: true, verificationId: verificationRow.id as string };
  }

  // Server-mediated attestation creation handler
  async function handleCreateAttestationRequest(
    event: any,
    requestOrigin: string | undefined,
    corsHeaders: Record<string, string>,
    userData: any,
    requestId: string,
    clientIP: string
  ) {
    try {
      const authResult = await getUserIdFromAuthHeader(event, requestOrigin);
      if (!authResult.success) {
        return authResult.response;
      }

      const userId = authResult.userId;

      const allowed = await enforceRateLimitForAction(
        "create_attestation",
        clientIP,
        requestId,
        requestOrigin,
        event.httpMethod,
        userId
      );

      if (!allowed) {
        return createRateLimitErrorResponse(requestId, requestOrigin);
      }

      // Validate minimal attestation payload
      const verificationIdRaw =
        userData?.verification_id || userData?.verificationId;
      const eventType = userData?.event_type || userData?.eventType;
      const status = userData?.status;
      const rawMetadata = userData?.metadata ?? null;

      // Normalize and validate metadata
      let metadata = rawMetadata;
      if (
        metadata !== null &&
        typeof metadata !== "object" &&
        typeof metadata !== "string"
      ) {
        return errorResponse(
          400,
          "metadata must be an object, string, or null",
          requestOrigin
        );
      }

      if (typeof metadata === "string") {
        metadata = { description: metadata };
      }

      const simpleproofTimestampId = userData?.simpleproof_timestamp_id;
      const irohDiscoveryId = userData?.iroh_discovery_id;
      const errorDetails = userData?.error_details ?? null;

      // Debug logging for attestation method IDs
      console.info("[create_attestation] Received attestation method IDs", {
        verificationId: verificationIdRaw,
        eventType,
        simpleproofTimestampId,
        irohDiscoveryId,
      });

      if (!verificationIdRaw || typeof verificationIdRaw !== "string") {
        return errorResponse(
          400,
          "Missing or invalid verification_id",
          requestOrigin
        );
      }
      if (!eventType || typeof eventType !== "string") {
        return errorResponse(
          400,
          "Missing or invalid event_type",
          requestOrigin
        );
      }
      if (!status || typeof status !== "string") {
        return errorResponse(400, "Missing or invalid status", requestOrigin);
      }

      // Application-level guard mirroring DB CHECK constraint
      if (!simpleproofTimestampId && !irohDiscoveryId) {
        return errorResponse(
          400,
          "At least one attestation method ID is required",
          requestOrigin
        );
      }

      const ownershipResult = await getOwnedVerificationRecord(
        verificationIdRaw,
        userId,
        requestOrigin,
        "attestation creation"
      );
      if (!ownershipResult.success) {
        return ownershipResult.response;
      }

      const verificationId = ownershipResult.verificationId;

      const { supabaseAdmin } = await import(
        "../../netlify/functions/supabase.js"
      );
      if (!supabaseAdmin) {
        console.error(
          "supabaseAdmin is not configured for attestation creation"
        );
        return errorResponse(500, "Server configuration error", requestOrigin);
      }

      // Insert attestation using service-role client, with application-level ownership enforcement
      const { data: attestationData, error: insertError } = await supabaseAdmin
        .from("attestations")
        .insert({
          verification_id: verificationId,
          event_type: eventType,
          metadata,
          simpleproof_timestamp_id: simpleproofTimestampId ?? null,
          iroh_discovery_id: irohDiscoveryId ?? null,
          status,
          error_details: errorDetails,
        })
        .select()
        .single();

      if (insertError) {
        console.error(
          "Failed to create attestation (server-mediated)",
          insertError
        );
        return errorResponse(
          500,
          "Failed to create attestation",
          requestOrigin
        );
      }

      console.info("[create_attestation] Attestation created successfully", {
        verificationId,
        eventType,
        simpleproofTimestampId,
        irohDiscoveryId,
        attestationId: attestationData?.id,
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          attestation: attestationData,
        }),
      };
    } catch (err) {
      console.error("Unexpected error in handleCreateAttestationRequest", err);
      return errorResponse(500, "Internal server error", requestOrigin);
    }
  }

  // Server-mediated attestation retrieval handler (multiple records)
  async function handleGetAttestationsRequest(
    event: any,
    requestOrigin: string | undefined,
    corsHeaders: Record<string, string>,
    userData: any,
    requestId: string,
    clientIP: string
  ) {
    try {
      const authResult = await getUserIdFromAuthHeader(event, requestOrigin);
      if (!authResult.success) {
        return authResult.response;
      }

      const userId = authResult.userId;

      const allowed = await enforceRateLimitForAction(
        "get_attestations",
        clientIP,
        requestId,
        requestOrigin,
        event.httpMethod,
        userId
      );

      if (!allowed) {
        return createRateLimitErrorResponse(requestId, requestOrigin);
      }

      const verificationIdRaw =
        userData?.verification_id || userData?.verificationId;

      if (!verificationIdRaw || typeof verificationIdRaw !== "string") {
        return errorResponse(
          400,
          "Missing or invalid verification_id",
          requestOrigin
        );
      }

      const ownershipResult = await getOwnedVerificationRecord(
        verificationIdRaw,
        userId,
        requestOrigin,
        "attestation retrieval"
      );
      if (!ownershipResult.success) {
        return ownershipResult.response;
      }

      const verificationId = ownershipResult.verificationId;

      const { supabaseAdmin } = await import(
        "../../netlify/functions/supabase.js"
      );
      if (!supabaseAdmin) {
        console.error(
          "supabaseAdmin is not configured for attestation retrieval"
        );
        return errorResponse(500, "Server configuration error", requestOrigin);
      }

      const { data: attestationsData, error: dbError } = await supabaseAdmin
        .from("attestations")
        .select(
          `
	        id,
	        verification_id,
	        event_type,
	        metadata,
	        status,
	        error_details,
	        created_at,
	        updated_at,
	        simpleproof_timestamp_id,
	        iroh_discovery_id,
	        simpleproof_timestamps (
	          id,
	          ots_proof,
	          bitcoin_block,
	          bitcoin_tx,
	          created_at,
	          verified_at,
	          is_valid
	        ),
	        iroh_node_discovery (
	          id,
	          node_id,
	          relay_url,
	          direct_addresses,
	          discovered_at,
	          last_seen,
	          is_reachable
	        )
	      `
        )
        .eq("verification_id", verificationId);

      if (dbError) {
        console.error(
          "Failed to retrieve attestations (server-mediated)",
          dbError
        );
        return errorResponse(500, "Failed to load attestations", requestOrigin);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          attestations: attestationsData || [],
        }),
      };
    } catch (err) {
      console.error("Unexpected error in handleGetAttestationsRequest", err);
      return errorResponse(500, "Internal server error", requestOrigin);
    }
  }

  // Server-mediated attestation retrieval handler (single record)
  async function handleGetAttestationRequest(
    event: any,
    requestOrigin: string | undefined,
    corsHeaders: Record<string, string>,
    userData: any,
    requestId: string,
    clientIP: string
  ) {
    try {
      const authResult = await getUserIdFromAuthHeader(event, requestOrigin);
      if (!authResult.success) {
        return authResult.response;
      }

      const userId = authResult.userId;

      const allowed = await enforceRateLimitForAction(
        "get_attestation",
        clientIP,
        requestId,
        requestOrigin,
        event.httpMethod,
        userId
      );

      if (!allowed) {
        return createRateLimitErrorResponse(requestId, requestOrigin);
      }

      const attestationId = userData?.attestation_id || userData?.attestationId;

      if (!attestationId || typeof attestationId !== "string") {
        return errorResponse(
          400,
          "Missing or invalid attestation_id",
          requestOrigin
        );
      }

      const { supabaseAdmin } = await import(
        "../../netlify/functions/supabase.js"
      );
      if (!supabaseAdmin) {
        console.error(
          "supabaseAdmin is not configured for attestation retrieval"
        );
        return errorResponse(500, "Server configuration error", requestOrigin);
      }

      const { data: attestationRow, error: attestationError } =
        await supabaseAdmin
          .from("attestations")
          .select(
            `
	        id,
	        verification_id,
	        event_type,
	        metadata,
	        status,
	        error_details,
	        created_at,
	        updated_at,
	        simpleproof_timestamps (
	          id,
	          ots_proof,
	          bitcoin_block,
	          bitcoin_tx,
	          created_at,
	          verified_at,
	          is_valid
	        ),
	        iroh_node_discovery (
	          id,
	          node_id,
	          relay_url,
	          direct_addresses,
	          discovered_at,
	          last_seen,
	          is_reachable
	        ),
	        multi_method_verification_results!inner (
	          id,
	          user_duid
	        )
	      `
          )
          .eq("id", attestationId)
          .eq("multi_method_verification_results.user_duid", userId)
          .single();

      if (attestationError) {
        if ((attestationError as any).code === "PGRST116") {
          return errorResponse(404, "Attestation not found", requestOrigin);
        }
        console.error(
          "Failed to load attestation (server-mediated)",
          attestationError
        );
        return errorResponse(500, "Failed to load attestation", requestOrigin);
      }

      if (!attestationRow) {
        return errorResponse(404, "Attestation not found", requestOrigin);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          attestation: attestationRow,
        }),
      };
    } catch (err) {
      console.error("Unexpected error in handleGetAttestationRequest", err);
      return errorResponse(500, "Internal server error", requestOrigin);
    }
  }

  try {
    // Parse request body
    let userData;
    try {
      userData =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      logError(parseError, {
        requestId,
        endpoint: "register-identity",
        method: event.httpMethod,
      });
      return createValidationErrorResponse(
        "Invalid JSON in request body",
        requestId,
        requestOrigin
      );
    }

    // ACTION ROUTING: support both registration and attestation operations
    const action: RegisterIdentityAction =
      typeof (userData as any)?.action === "string"
        ? ((userData as any).action as RegisterIdentityAction)
        : "register";

    if (action === "create_attestation") {
      return await handleCreateAttestationRequest(
        event,
        requestOrigin,
        corsHeaders,
        userData,
        requestId,
        clientIP
      );
    }

    if (action === "get_attestations") {
      return await handleGetAttestationsRequest(
        event,
        requestOrigin,
        corsHeaders,
        userData,
        requestId,
        clientIP
      );
    }

    if (action === "get_attestation") {
      return await handleGetAttestationRequest(
        event,
        requestOrigin,
        corsHeaders,
        userData,
        requestId,
        clientIP
      );
    }

    // Registration-specific logic continues...

    const registrationAllowed = await enforceRateLimitForAction(
      "register",
      clientIP,
      requestId,
      requestOrigin,
      event.httpMethod
    );

    if (!registrationAllowed) {
      return createRateLimitErrorResponse(requestId, requestOrigin);
    }

    console.log(`✅ Rate limit check passed for IP: ${clientIP}`);

    // DIAGNOSTIC: Log sanitized request payload for debugging
    try {
      console.log("\ud83d\udce6 Received registration payload (sanitized):", {
        username:
          typeof userData?.username === "string"
            ? userData.username
            : undefined,
        nip05: typeof userData?.nip05 === "string" ? userData.nip05 : undefined,
        lightningAddress:
          typeof userData?.lightningAddress === "string"
            ? userData.lightningAddress
            : undefined,
        npubPrefix:
          typeof userData?.npub === "string"
            ? `${userData.npub.slice(0, 8)}\u2026`
            : undefined,
        encryptedNsecPrefix:
          typeof userData?.encryptedNsec === "string"
            ? `${userData.encryptedNsec.slice(0, 6)}\u2026`
            : undefined,
        selectedDomain:
          (userData && (userData.selectedDomain || (userData as any).domain)) ||
          undefined,
      });
    } catch {}

    // Validate request data
    const validationResult = validateRegistrationData(userData);
    if (!validationResult.success) {
      logError(new Error("Validation failed"), {
        requestId,
        endpoint: "register-identity",
        method: event.httpMethod,
        details: validationResult.errors,
      });
      // Return detailed validation errors to client for debugging
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid registration data",
          details: validationResult.errors,
          meta: {
            timestamp: new Date().toISOString(),
            resolvedDomain: resolvePlatformLightningDomainServer(),
            build: REGISTER_IDENTITY_BUILD,
          },
        }),
      };
    }

    const validatedData = (validationResult as ValidationSuccess).data;

    // Check username availability
    console.log("🔍 Checking username availability:", {
      username: validatedData.username,
      hasNpub: !!validatedData.npub,
      hasEncryptedNsec: !!validatedData.encryptedNsec,
    });

    let isUsernameAvailable;
    try {
      isUsernameAvailable = await checkUsernameAvailability(
        validatedData.username
      );
      console.log("✅ Username availability check completed:", {
        available: isUsernameAvailable,
      });
    } catch (usernameError) {
      console.error("❌ Username availability check failed:", usernameError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Username availability check failed",
          debug:
            usernameError instanceof Error
              ? usernameError.message
              : "Unknown error",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    if (!isUsernameAvailable) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Username is already taken",
          field: "username",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }
    // Reserve NIP-05: insert into nip05_records to prevent duplicate usernames
    try {
      const domain = resolvePlatformLightningDomainServer();
      const local = String(validatedData.username || "")
        .trim()
        .toLowerCase();
      const identifier = `${local}@${domain}`;

      const { createHmac } = await import("node:crypto");
      const secret = await getDUIDSecret();

      // user_duid = HMAC-SHA-256(secret, "username@domain") - same value as user_identities.id
      const user_duid = createHmac("sha256", secret)
        .update(identifier)
        .digest("hex");
      const pubkey_duid = createHmac("sha256", secret)
        .update(`NPUBv1:${validatedData.npub}`)
        .digest("hex");

      // Track reservation details for potential cleanup on failure
      reservedUserDuid = user_duid;
      reservedDomain = domain;

      const { error: nip05InsertError } = await supabase
        .from("nip05_records")
        .insert({
          domain,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_duid,
          pubkey_duid,
        });

      if (nip05InsertError) {
        // Unique violation implies username already taken
        const code = nip05InsertError.code || "";
        console.warn("NIP-05 reservation insert error:", nip05InsertError);
        if (
          code === "23505" ||
          /duplicate/i.test(nip05InsertError.message || "")
        ) {
          return {
            statusCode: 409,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: "Username is already taken",
              field: "username",
            }),
          };
        }
        // Treat undefined_column (42703) as schema misconfiguration (no plaintext fallback)
        if (
          code === "42703" ||
          /column .* does not exist/i.test(nip05InsertError.message || "")
        ) {
          console.error(
            "Privacy-first nip05_records schema is misconfigured (missing DUID columns):",
            nip05InsertError
          );
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: "Server configuration error: NIP-05 schema misconfigured",
            }),
          };
        } else {
          // Any other error -> fail fast with clear message
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: "Failed to reserve username",
            }),
          };
        }
      }

      console.log("✅ NIP-05 reservation created for", identifier);
    } catch (reserveErr) {
      console.error("Failed to reserve NIP-05 username:", reserveErr);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to reserve username",
        }),
      };
    }

    // Generate privacy-preserving identifier (non-blocking)
    await generatePrivacyPreservingHash(validatedData.username).catch(() => {});

    // Validate role from Identity Forge (accept as-is, no legacy mapping)
    const standardizedRole = validateRole(String(validatedData.role || ""));

    // Generate Individual Wallet Sovereignty spending limits
    const spendingLimits = generateSovereigntySpendingLimits(standardizedRole);

    // Create user identity in database with maximum encryption and DUID
    console.log("🔍 Creating user identity in database:", {
      role: standardizedRole,
      hasSpendingLimits: !!spendingLimits,
      npubLength: validatedData.npub?.length,
      encryptedNsecLength: validatedData.encryptedNsec?.length,
    });

    let profileResult;
    try {
      profileResult = await createUserIdentity(
        { ...validatedData, role: standardizedRole },
        spendingLimits
      );
      console.log("✅ User identity creation completed:", {
        success: profileResult.success,
        hasData:
          profileResult.success &&
          !!(profileResult as CreateUserIdentitySuccess).data,
      });
    } catch (createError) {
      console.error("❌ User identity creation failed:", createError);
      const _name = createError instanceof Error ? createError.name : "Unknown";
      const _message =
        createError instanceof Error ? createError.message : "Unknown error";
      const _stack =
        createError instanceof Error && createError.stack
          ? createError.stack.substring(0, 500)
          : undefined;
      console.error("Create error details:", {
        name: _name,
        message: _message,
        stack: _stack,
      });
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "User identity creation failed",
          debug:
            createError instanceof Error
              ? createError.message
              : "Unknown error",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    if (!profileResult.success) {
      console.error(
        "❌ User identity creation returned failure:",
        profileResult.error
      );
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: profileResult.error,
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Baseline multi-method verification result ID used by downstream attestations
    let verificationResultId: string | null = null;

    // ============================================================================
    // PHASE 2 WEEK 3 DAY 8: NIP-03 ATTESTATION INTEGRATION
    // ============================================================================
    // CRITICAL FIX: NIP-03 attestation is deferred to post-registration
    // Reason: Backend (Netlify Function) has no active session context for CEPS.signEventWithActiveSession()
    // The Kind:0 profile event is published CLIENT-SIDE in IdentityForge.tsx
    // NIP-03 attestation should be published in a separate post-registration step via the client
    // This prevents infinite recursion and maintains zero-knowledge architecture

    // Task 5: Feature flag gating for NIP-03 attestation flow
    const nip03Enabled = process.env.VITE_NIP03_ENABLED === "true";
    const nip03IdentityCreationEnabled =
      process.env.VITE_NIP03_IDENTITY_CREATION === "true";
    const simpleproofEnabled = process.env.VITE_SIMPLEPROOF_ENABLED === "true";

    // DEFERRED: NIP-03 attestation is now handled post-registration
    // If NIP-03 is enabled, we'll store the necessary metadata for later attestation
    // but skip the actual event signing/publishing during registration
    if (
      nip03Enabled &&
      nip03IdentityCreationEnabled &&
      simpleproofEnabled &&
      validatedData.npub
    ) {
      try {
        console.log(
          "🔐 Starting NIP-03 attestation flow for identity creation"
        );

        // ====================================================================
        // Task 1: Create SimpleProof timestamp for Kind:0 event
        // ====================================================================
        let simpleproofTimestampId: string | null = null;
        let otsProof: string | null = null;
        let bitcoinBlock: number | null = null;
        let bitcoinTx: string | null = null;

        try {
          console.log("⏱️ Creating SimpleProof timestamp for Kind:0 event...");

          // Prepare data for SimpleProof: Public identifiers only (no internal IDs)
          // SECURITY: Never expose DUID or internal database UUIDs in public attestations
          const nip05Identifier = `${
            validatedData.username
          }@${resolvePlatformLightningDomainServer()}`;
          const simpleproofData = JSON.stringify({
            event_type: "identity_creation",
            nip05: nip05Identifier,
            npub: validatedData.npub,
            timestamp: Math.floor(Date.now() / 1000),
          });

          // Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
          let lastError: Error | null = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const simpleproofResponse = await fetch(
                `${
                  process.env.FRONTEND_URL || "https://www.satnam.pub"
                }/.netlify/functions/simpleproof-timestamp`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "create",
                    data: simpleproofData,
                    verification_id: profileResult.data!.id,
                  }),
                }
              );

              if (!simpleproofResponse.ok) {
                throw new Error(
                  `HTTP ${simpleproofResponse.status}: ${simpleproofResponse.statusText}`
                );
              }

              const simpleproofResult = await simpleproofResponse.json();

              if (!simpleproofResult.ots_proof) {
                throw new Error("SimpleProof API returned no OTS proof");
              }

              otsProof = simpleproofResult.ots_proof;
              bitcoinBlock = simpleproofResult.bitcoin_block || null;
              bitcoinTx = simpleproofResult.bitcoin_tx || null;

              // Store in simpleproof_timestamps table
              const { data: timestampData, error: timestampError } =
                await supabase
                  .from("simpleproof_timestamps")
                  .insert({
                    verification_id: profileResult.data!.id,
                    ots_proof: otsProof,
                    bitcoin_block: bitcoinBlock,
                    bitcoin_tx: bitcoinTx,
                    verified_at: Math.floor(Date.now() / 1000),
                    is_valid: true,
                  })
                  .select("id")
                  .single();

              if (timestampError) {
                throw new Error(`Database error: ${timestampError.message}`);
              }

              simpleproofTimestampId = timestampData.id;
              console.log(
                `✅ SimpleProof timestamp created: ${simpleproofTimestampId}`
              );
              break; // Success, exit retry loop
            } catch (error) {
              lastError =
                error instanceof Error ? error : new Error(String(error));
              const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff

              if (attempt < 3) {
                console.warn(
                  `⚠️ SimpleProof attempt ${attempt} failed, retrying in ${delay}ms...`,
                  lastError.message
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          }

          if (!simpleproofTimestampId) {
            throw new Error(
              `SimpleProof timestamp creation failed after 3 attempts: ${lastError?.message}`
            );
          }
        } catch (simpleproofError) {
          console.error(
            "❌ SimpleProof timestamp creation failed:",
            simpleproofError instanceof Error
              ? simpleproofError.message
              : simpleproofError
          );
          // Block registration on SimpleProof failure (critical for attestation)
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error:
                "Attestation failed: SimpleProof timestamp creation failed",
              details:
                simpleproofError instanceof Error
                  ? simpleproofError.message
                  : "Unknown error",
              meta: { timestamp: new Date().toISOString() },
            }),
          };
        }

        // ====================================================================
        // Task 2: DEFERRED - NIP-03 Kind:1040 event publishing
        // ====================================================================
        // CRITICAL FIX: NIP-03 event signing/publishing is deferred to post-registration
        // Reason: Backend has no active session context for CEPS.signEventWithActiveSession()
        // The client (IdentityForge.tsx) will handle NIP-03 attestation after registration completes
        // This prevents infinite recursion and maintains zero-knowledge architecture

        // Store SimpleProof data for later NIP-03 attestation (non-blocking)
        // The client will retrieve this and publish the NIP-03 event with proper session context
        console.log(
          "📝 NIP-03 attestation deferred to post-registration (client-side)"
        );
        console.log(
          `✅ SimpleProof timestamp available for NIP-03: ${simpleproofTimestampId}`
        );

        // ====================================================================
        // Task 3: Store NIP-03 attestation metadata for post-registration
        // ====================================================================
        // DEFERRED: Store SimpleProof data so client can publish NIP-03 event later
        // This allows the client to sign and publish the NIP-03 event with proper session context
        try {
          console.log(
            "💾 Storing NIP-03 attestation metadata for post-registration..."
          );

          // SECURITY: Use public identifiers only (NIP-05, npub)
          // Never expose DUID or internal database UUIDs in metadata
          const nip05Identifier = `${
            validatedData.username
          }@${resolvePlatformLightningDomainServer()}`;

          // Store attestation metadata with nip03_event_id=null (will be updated when client publishes)
          const { error: attestationError } = await supabase
            .from("nip03_attestations")
            .insert({
              attested_event_id: nip05Identifier, // Use NIP-05 as public identifier (not DUID)
              attested_event_kind: 0, // Kind:0 profile event
              nip03_event_id: null, // Will be updated when client publishes NIP-03 event
              nip03_event_kind: 1040, // NIP-03 attestation event
              simpleproof_timestamp_id: simpleproofTimestampId,
              ots_proof: otsProof,
              bitcoin_block: bitcoinBlock,
              bitcoin_tx: bitcoinTx,
              event_type: "identity_creation",
              user_duid: profileResult.data!.id, // Internal use only (RLS, queries)
              relay_urls: ["wss://relay.satnam.pub"],
              published_at: null, // Will be set when client publishes NIP-03 event
              verified_at: bitcoinBlock ? Math.floor(Date.now() / 1000) : null,
              metadata: {
                nip05: nip05Identifier, // Public identifier
                npub: validatedData.npub, // Public identifier
                // SECURITY: Do NOT include: user_duid, internal IDs, or private data
              },
            });

          if (attestationError) {
            throw new Error(`Database error: ${attestationError.message}`);
          }

          console.log(
            `✅ NIP-03 attestation metadata stored for user: ${
              profileResult.data!.id
            }`
          );
          console.log(
            "⏳ Awaiting client-side NIP-03 event publication (post-registration)"
          );
        } catch (attestationStorageError) {
          console.error(
            "❌ NIP-03 attestation metadata storage failed:",
            attestationStorageError instanceof Error
              ? attestationStorageError.message
              : attestationStorageError
          );
          // Don't block registration on storage failure (non-critical)
          console.warn(
            "⚠️ Continuing registration despite attestation metadata storage failure"
          );
        }

        // ====================================================================
        // Task 4: Create PKARR record (non-blocking, fire-and-forget)
        // ====================================================================
        // Option B: Create PKARR AFTER NIP-03 is published
        // This ensures PKARR address is linked to NIP-03 attestation
        const pkarrEnabled = process.env.VITE_PKARR_ENABLED === "true";
        if (pkarrEnabled && validatedData.npub) {
          // Fire-and-forget PKARR publishing (don't block registration)
          publishPkarrRecordAsync(
            validatedData.npub,
            validatedData.username,
            resolvePlatformLightningDomainServer()
          ).catch((err) => {
            console.warn(
              "⚠️ PKARR publishing failed (non-blocking):",
              err instanceof Error ? err.message : err
            );
          });
        }

        console.log("✅ NIP-03 attestation flow completed successfully");
      } catch (attestationFlowError) {
        console.error(
          "❌ NIP-03 attestation flow error:",
          attestationFlowError instanceof Error
            ? attestationFlowError.message
            : attestationFlowError
        );
        // Attestation flow errors are already handled above with specific responses
        // This catch is for unexpected errors
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: "Attestation flow failed",
            details:
              attestationFlowError instanceof Error
                ? attestationFlowError.message
                : "Unknown error",
            meta: { timestamp: new Date().toISOString() },
          }),
        };
      }
    } else {
      // Feature flags disabled: proceed with basic PKARR publishing (legacy flow)
      const pkarrEnabled = process.env.VITE_PKARR_ENABLED === "true";
      if (pkarrEnabled && validatedData.npub) {
        // Fire-and-forget PKARR publishing (don't block registration)
        publishPkarrRecordAsync(
          validatedData.npub,
          validatedData.username,
          resolvePlatformLightningDomainServer()
        ).catch((err) => {
          console.warn(
            "⚠️ PKARR publishing failed (non-blocking):",
            err instanceof Error ? err.message : err
          );
        });
      }
    }

    // Create secure JWT token compatible with frontend SecureTokenManager expectations
    // Generate required fields that frontend expects
    const sessionId = crypto.randomBytes(16).toString("hex"); // Generate random session ID
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not configured");
    }
    const hashedId = crypto
      .createHmac("sha256", jwtSecret)
      .update(`${profileResult.data!.id}|${sessionId}`)
      .digest("hex");

    const jwtToken = await createSecureJWT({
      userId: profileResult.data!.id, // Use DUID from created user record
      hashedId: hashedId, // Required by frontend SecureTokenManager
      username: validatedData.username,
      nip05: `${
        validatedData.username
      }@${resolvePlatformLightningDomainServer()}`,
      role: standardizedRole,
      type: "access", // Required by frontend SecureTokenManager
      sessionId: sessionId, // Required by frontend SecureTokenManager
    });
    // Baseline multi-method verification record for attestations
    // Create an initial multi_method_verification_results row so all
    // downstream attestations (OpenTimestamps, Iroh, etc.) share a stable UUID.
    // FIX: Use supabaseAdmin (service role) to bypass RLS since anon role lacks INSERT permission
    try {
      const nip05Identifier =
        validatedData.nip05 ||
        `${validatedData.username}@${resolvePlatformLightningDomainServer()}`;

      const identifierHash = crypto
        .createHash("sha256")
        .update(nip05Identifier)
        .digest("hex");

      const verificationAttemptId = crypto.randomUUID();
      const baselineVerificationId = crypto.randomUUID();

      // Import supabaseAdmin for service-role access (bypasses RLS)
      const { supabaseAdmin } = await import(
        "../../netlify/functions/supabase.js"
      );

      if (!supabaseAdmin) {
        console.error(
          "❌ supabaseAdmin not configured - multi_method_verification_results insert requires service role"
        );
        // Continue without verification_id; frontend will handle gracefully
      } else {
        const { error: verificationInsertError } = await supabaseAdmin
          .from("multi_method_verification_results")
          .insert({
            id: baselineVerificationId,
            verification_attempt_id: verificationAttemptId,
            identifier_hash: identifierHash,
            kind0_verified: false,
            kind0_response_time_ms: 0,
            kind0_error: "not_run",
            kind0_nip05: null,
            kind0_pubkey: null,
            pkarr_verified: false,
            pkarr_response_time_ms: 0,
            pkarr_error: "not_run",
            pkarr_nip05: null,
            pkarr_pubkey: null,
            dns_verified: false,
            dns_response_time_ms: 0,
            dns_error: "not_run",
            dns_nip05: null,
            dns_pubkey: null,
            trust_score: 0,
            trust_level: "none",
            agreement_count: 0,
            methods_agree: false,
            verified: false,
            primary_method: "none",
            user_duid: profileResult.data!.id,
            ip_address_hash: null,
          });

        if (verificationInsertError) {
          console.error(
            "❌ Failed to log baseline multi-method verification result:",
            verificationInsertError
          );
        } else {
          verificationResultId = baselineVerificationId;
          console.log(
            "✅ Baseline multi-method verification result created:",
            verificationResultId
          );
        }
      }
    } catch (verificationBootstrapError) {
      const message =
        verificationBootstrapError instanceof Error
          ? verificationBootstrapError.message
          : String(verificationBootstrapError);
      console.error(
        "❌ Unexpected error while bootstrapping multi-method verification result:",
        message
      );
    }

    const baseResponse: Omit<ResponseData, "verification_id"> = {
      success: true,
      message: "Identity registered successfully with sovereignty enforcement",
      user: {
        id: profileResult.data!.id, // FIXED: Use actual database user ID for consistency
        hashedId: hashedId, // Include hashed ID for JWT validation
        username: validatedData.username,
        nip05:
          validatedData.nip05 ||
          `${validatedData.username}@${resolvePlatformLightningDomainServer()}`,
        lightningAddress:
          validatedData.lightningAddress ||
          `${validatedData.username}@${resolvePlatformLightningDomainServer()}`,
        displayName: validatedData.displayName || validatedData.username,
        role: standardizedRole,
        is_active: true, // FIXED: Include is_active for authentication state
        spendingLimits,
        registeredAt: new Date().toISOString(),
      },
      session: {
        token: jwtToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      sessionToken: jwtToken, // FIXED: Include sessionToken at root level for compatibility
      meta: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "production",
      },
    };

    // FIX-1: Include verification_id for SimpleProof/Iroh attestations during registration
    // using the UUID from multi_method_verification_results when available
    const responseData: ResponseData = verificationResultId
      ? { ...baseResponse, verification_id: verificationResultId }
      : baseResponse;

    // Process invitation if provided - distinguish between family and peer invitations
    if (userData.invitationToken) {
      const inviteToken = userData.invitationToken;
      const isFamilyInvitation = inviteToken.startsWith("inv_");

      if (isFamilyInvitation) {
        // Phase 2: Auto-accept family federation invitation during registration
        try {
          console.log(
            "🏠 Processing family federation invitation during registration"
          );

          const familyAcceptResponse = await fetch(
            `${
              process.env.FRONTEND_URL || "https://satnam.pub"
            }/api/family/invitations/accept`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwtToken}`,
              },
              body: JSON.stringify({ token: inviteToken }),
            }
          );

          if (familyAcceptResponse.ok) {
            const acceptResult = await familyAcceptResponse.json();
            if (acceptResult.success && acceptResult.federation) {
              responseData.federationJoined = {
                federation_duid: acceptResult.federation.duid,
                role: acceptResult.federation.role,
                federation_name: acceptResult.federation.name,
              };
              console.log(
                "✅ Family federation joined successfully during registration:",
                acceptResult.federation.duid
              );
            } else if (!acceptResult.success) {
              // Accept endpoint returned success: false
              console.warn(
                "⚠️ Family invitation acceptance failed:",
                acceptResult.error || "Unknown error"
              );
              responseData.federationJoinPending = true;
            }
          } else {
            // HTTP error from accept endpoint
            const errorBody = await familyAcceptResponse
              .text()
              .catch(() => "Unknown error");
            console.warn(
              `⚠️ Family invitation acceptance HTTP error ${familyAcceptResponse.status}:`,
              errorBody
            );
            responseData.federationJoinPending = true;
          }
        } catch (familyInviteError) {
          console.warn(
            "⚠️ Failed to process family invitation during registration:",
            familyInviteError instanceof Error
              ? familyInviteError.message
              : String(familyInviteError)
          );
          // Don't fail registration - mark as pending for manual acceptance
          responseData.federationJoinPending = true;
        }
      } else {
        // Existing peer invitation handling (non-family invitations)
        try {
          // Process the invitation and award credits
          const invitationResponse = await fetch(
            `${
              process.env.FRONTEND_URL || "https://satnam.pub"
            }/api/authenticated/process-invitation`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwtToken}`,
              },
              body: JSON.stringify({
                inviteToken: inviteToken,
              }),
            }
          );

          if (invitationResponse.ok) {
            const invitationResult = await invitationResponse.json();
            if (invitationResult.success) {
              responseData.invitationProcessed = {
                creditsAwarded: invitationResult.creditsAwarded,
                welcomeMessage: invitationResult.welcomeMessage,
                personalMessage: invitationResult.personalMessage,
              };
              console.log(
                "Invitation processed successfully during registration"
              );
            }
          }
        } catch (invitationError) {
          console.warn(
            "Failed to process peer invitation during registration:",
            invitationError
          );
          // Don't fail registration if invitation processing fails
        }
      }
    }

    // Family federation invitation handling - show modal if pending or has familyId
    if (responseData.federationJoinPending || validatedData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return jsonResponse(201, responseData, requestOrigin);
  } catch (error) {
    logError(error, {
      requestId,
      endpoint: "register-identity",
      method: event.httpMethod,
    });

    // Cleanup reserved NIP-05 if user creation failed after reservation
    try {
      if (reservedUserDuid && reservedDomain) {
        await supabase
          .from("nip05_records")
          .delete()
          .eq("user_duid", reservedUserDuid)
          .eq("domain", reservedDomain);
        console.log("✅ Cleaned up reserved NIP-05 after registration failure");
      }
    } catch (cleanupError) {
      console.error("⚠️ Failed to cleanup reserved NIP-05:", cleanupError);
    }

    return errorResponse(500, "Registration failed", requestOrigin);
  }
};
