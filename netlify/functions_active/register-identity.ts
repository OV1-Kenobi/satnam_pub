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
import { resolvePlatformLightningDomainServer } from "../functions/utils/domain.server.js";

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

  // NIP-05 validation (should match username@satnam.pub)
  if (
    userData.nip05 &&
    userData.nip05 !==
      `${userData.username}@${resolvePlatformLightningDomainServer()}`
  ) {
    errors.push({
      field: "nip05",
      message: `NIP-05 must match username@${resolvePlatformLightningDomainServer()} format`,
    });
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
    const hashed_nip05 = hmac.digest("hex");

    const { data, error } = await supabase
      .from("nip05_records")
      .select("id")
      .eq("domain", domain)
      .eq("hashed_nip05", hashed_nip05)
      .eq("is_active", true)
      .limit(1);

    if (error) {
      console.error("Username availability check failed:", error);
      return false; // Conservative: assume not available on error
    }

    const isAvailable = !data || data.length === 0;
    console.log(
      `Username availability: ${username} -> ${
        isAvailable ? "available" : "taken"
      }`
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
    const { generateUserSalt, createHashedUserData } = await import(
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

    // Note: Using standard hashed column format for maximum privacy protection
    // MAXIMUM ENCRYPTION: Hash all sensitive user data with unique salt
    let hashedUserData: {
      hashed_npub: string;
      hashed_nip05: string;
      [k: string]: any;
    };
    let hashedUsername;
    let hashedLightningAddress;
    try {
      hashedUserData = (await createHashedUserData(
        {
          npub: userData.npub,
          nip05: userData.nip05 || "",
          encryptedNsec: encryptedNsecNoble, // Use Noble V2 encrypted nsec
          password: userData.password,
        },
        userSalt
      )) as { hashed_npub: string; hashed_nip05: string; [k: string]: any };

      // Hash additional fields manually using hashUserData
      const { hashUserData } = await import(
        "../../lib/security/privacy-hashing.js"
      );
      hashedUsername = await hashUserData(userData.username, userSalt);
      hashedLightningAddress = userData.lightningAddress
        ? await hashUserData(userData.lightningAddress, userSalt)
        : null;
    } catch (hashError) {
      console.error("Failed to hash user data:", hashError);
      throw new Error("Failed to encrypt user data securely");
    }

    // Create profile data with DUID as primary key for O(1) authentication lookups
    const profileData = {
      id: deterministicUserId, // Use DUID as primary key for O(1) database lookups
      user_salt: userSalt, // Store user salt for future hashing operations

      // DECRYPTABLE NSEC: Store Noble V2 encrypted nsec for authentication flow
      encrypted_nsec: encryptedNsecNoble, // noble-v2.<salt>.<iv>.<cipher>

      // HASHED COLUMNS ONLY - MAXIMUM ENCRYPTION COMPLIANCE
      hashed_username: hashedUsername,
      hashed_npub: hashedUserData.hashed_npub,
      hashed_nip05: hashedUserData.hashed_nip05,
      hashed_lightning_address: hashedLightningAddress,

      // Metadata (non-sensitive)
      role: userData.role,
      spending_limits: spendingLimits,
      privacy_settings: {
        privacy_level: "maximum", // Upgraded to maximum for hashed storage
        zero_knowledge_enabled: true,
        over_encryption: true, // Flag indicating hashed storage
        is_imported_account: userData.isImportedAccount || false,
        detected_profile_data: userData.detectedProfile || null,
      },

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
      "🔄 Attempting to insert user identity with hashed columns...",
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
        hasHashedNpub: !!profileData.hashed_npub,
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
          hasHashedNpub: !!profileData.hashed_npub,
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
  console.log("🚀 Registration handler started:", {
    method: event.httpMethod,
    path: event.path,
    headers: Object.keys(event.headers || {}),
    bodyLength: event.body?.length || 0,
    timestamp: new Date().toISOString(),
  });

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

  // CORS headers for browser compatibility (env-aware)
  function getAllowedOrigin(origin: string | undefined): string {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) return "https://satnam.pub";
    if (!origin) return "*";
    try {
      const u = new URL(origin);
      if (
        (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
        u.protocol === "http:"
      ) {
        return origin;
      }
    } catch {}
    return "*";
  }
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        Allow: "POST",
      },
      body: JSON.stringify({
        success: false,
        error: "Method not allowed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  // Track reserved NIP-05 reservation for cleanup across try/catch scope
  let reservedHashedNip05: string | null = null;
  let reservedDomain: string | null = null;

  try {
    // Parse request body
    let userData;
    try {
      userData =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid JSON in request body",
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Extract client information for security
    // Environment-aware rate limiting for registration attempts
    try {
      const xfwd =
        event.headers?.["x-forwarded-for"] ||
        event.headers?.["X-Forwarded-For"];
      const clientIp = Array.isArray(xfwd)
        ? xfwd[0]
        : (xfwd || "").split(",")[0]?.trim() || "unknown";

      // Adjust rate limits based on environment
      const isDevelopment = process.env.NODE_ENV !== "production";
      const windowSec = isDevelopment ? 300 : 60; // 5 minutes in dev, 1 minute in prod
      const maxAttempts = isDevelopment ? 50 : 5; // 50 attempts in dev, 5 in prod

      console.log(
        `🔒 Rate limiting: ${maxAttempts} attempts per ${windowSec}s (${
          isDevelopment ? "development" : "production"
        } mode)`
      );

      const windowStart = new Date(
        Math.floor(Date.now() / (windowSec * 1000)) * (windowSec * 1000)
      ).toISOString();
      const { supabase: rateLimitSupabase } = await import(
        "../../netlify/functions/supabase.js"
      );
      const { data, error } = await rateLimitSupabase.rpc(
        "increment_auth_rate",
        {
          p_identifier: clientIp,
          p_scope: "ip",
          p_window_start: windowStart,
          p_limit: maxAttempts,
        }
      );

      const limited = Array.isArray(data) ? data?.[0]?.limited : data?.limited;
      if (error) {
        console.error("Rate limiting error:", error);
        // In development, don't block on rate limiting errors
        if (isDevelopment) {
          console.warn(
            "⚠️ Rate limiting error in development - allowing request"
          );
        } else {
          return {
            statusCode: 429,
            headers: corsHeaders,
            body: JSON.stringify({
              success: false,
              error: "Rate limiting service unavailable",
            }),
          };
        }
      }

      if (limited) {
        console.warn(`🚫 Rate limit exceeded for IP: ${clientIp}`);
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: `Too many registration attempts. Please wait ${windowSec} seconds before trying again.`,
          }),
        };
      }

      console.log(`✅ Rate limit check passed for IP: ${clientIp}`);
    } catch (rateLimitError) {
      console.error("Rate limiting exception:", rateLimitError);
      // In development, don't block on rate limiting exceptions
      const isDevelopment = process.env.NODE_ENV !== "production";
      if (isDevelopment) {
        console.warn(
          "⚠️ Rate limiting exception in development - allowing request"
        );
      } else {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: "Too many registration attempts",
          }),
        };
      }
    }

    // Validate request data
    const validationResult = validateRegistrationData(userData);
    if (!validationResult.success) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid registration data",
          details: validationResult.errors,
          meta: {
            timestamp: new Date().toISOString(),
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

      const hashed_nip05 = createHmac("sha256", secret)
        .update(identifier)
        .digest("hex");
      const hashed_npub = createHmac("sha256", secret)
        .update(`NPUBv1:${validatedData.npub}`)
        .digest("hex");

      // Track reservation details for potential cleanup on failure
      reservedHashedNip05 = hashed_nip05;
      reservedDomain = domain;

      const { error: nip05InsertError } = await supabase
        .from("nip05_records")
        .insert({
          domain,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          hashed_nip05,
          hashed_npub,
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

    // Optional: Publish PKARR record (non-blocking - Phase 2A Day 5)
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

    const responseData: ResponseData = {
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

    // Process peer invitation if provided
    if (userData.invitationToken) {
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
              inviteToken: userData.invitationToken,
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
          "Failed to process invitation during registration:",
          invitationError
        );
        // Don't fail registration if invitation processing fails
      }
    }

    // Family federation invitation handling
    if (validatedData.invitationToken || validatedData.familyId) {
      responseData.postAuthAction = "show_invitation_modal";
    }

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error("Registration error:", error);

    // Cleanup reserved NIP-05 if user creation failed after reservation
    try {
      if (reservedHashedNip05 && reservedDomain) {
        await supabase
          .from("nip05_records")
          .delete()
          .eq("hashed_nip05", reservedHashedNip05)
          .eq("domain", reservedDomain);
        console.log("✅ Cleaned up reserved NIP-05 after registration failure");
      }
    } catch (cleanupError) {
      console.error("⚠️ Failed to cleanup reserved NIP-05:", cleanupError);
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Registration failed",
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }
};
